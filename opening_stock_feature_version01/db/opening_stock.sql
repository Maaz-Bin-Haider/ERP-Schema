-- ============================================================================
-- OPENING STOCK + OPENING BALANCE EQUITY (onboarding / data migration)
-- ----------------------------------------------------------------------------
-- Lets a new business load the stock it already holds at go-live, fully
-- serial-tracked and COGS-ready, WITHOUT creating any vendor payable.
--   Opening stock  ->  Debit Inventory / Credit "Opening Balance" (OBE, 3001)
-- All opening entries (stock, party balances, cash) are anchored to the
-- dedicated "Opening Balance" equity account, then swept into Owner's Capital
-- in one reclassification step.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Flag that marks a purchase document as an opening-stock load (so the
--    operational Purchases section never shows or counts these).
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchaseinvoices
    ADD COLUMN IF NOT EXISTS is_opening boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. System placeholder vendor, used only when an opening-stock load is
--    entered without a reference vendor (vendor_id is NOT NULL).
--    It never receives journal lines, so it always has a zero balance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_opening_stock_vendor_id()
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint; v_ar bigint; v_ap bigint;
BEGIN
    SELECT party_id INTO v_id FROM parties WHERE party_name = 'OPENING STOCK' LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;

    SELECT account_id INTO v_ar FROM chartofaccounts WHERE account_name = 'Accounts Receivable' LIMIT 1;
    SELECT account_id INTO v_ap FROM chartofaccounts WHERE account_name = 'Accounts Payable'    LIMIT 1;

    INSERT INTO parties(party_name, party_type, ar_account_id, ap_account_id, opening_balance, balance_type)
    VALUES ('OPENING STOCK', 'Vendor', v_ar, v_ap, 0, 'Credit')
    RETURNING party_id INTO v_id;
    RETURN v_id;
END; $$;

-- ---------------------------------------------------------------------------
-- 3. Create an opening-stock load.
--    data = {
--      as_of_date, vendor_name (optional, reference only), notes,
--      created_by_id,
--      items: [ { item_id, unit_price (cost), comment, serials:[..] }, ... ]
--    }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_opening_stock(data jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    v_as_of       date    := COALESCE(NULLIF(data->>'as_of_date','')::date, CURRENT_DATE);
    v_vendor_name text    := NULLIF(TRIM(COALESCE(data->>'vendor_name','')), '');
    v_user        int     := NULLIF(data->>'created_by_id','')::int;
    v_vendor_id   bigint;
    v_inv_id      bigint;
    v_item        jsonb;
    v_item_id     bigint;
    v_unit_price  numeric;
    v_serials     jsonb;
    v_serial      text;
    v_comment     text;
    v_qty         int;
    v_total       numeric := 0;
    v_all_serials text[]  := ARRAY[]::text[];
    v_dup         text;
    v_inv_acc     bigint;
    v_obe_acc     bigint;
    v_pit_id      bigint;
    v_j_id        bigint;
    v_item_count  int := 0;
    v_unit_count  int := 0;
BEGIN
    IF data->'items' IS NULL OR jsonb_array_length(data->'items') = 0 THEN
        RETURN jsonb_build_object('status','error','message','No items provided.');
    END IF;

    SELECT account_id INTO v_inv_acc FROM chartofaccounts WHERE account_name = 'Inventory'       LIMIT 1;
    SELECT account_id INTO v_obe_acc FROM chartofaccounts WHERE account_name = 'Opening Balance' LIMIT 1;
    IF v_inv_acc IS NULL THEN RETURN jsonb_build_object('status','error','message','Inventory account not found in chart of accounts.'); END IF;
    IF v_obe_acc IS NULL THEN RETURN jsonb_build_object('status','error','message','"Opening Balance" account not found in chart of accounts.'); END IF;

    -- resolve optional reference vendor
    IF v_vendor_name IS NOT NULL THEN
        SELECT party_id INTO v_vendor_id FROM parties WHERE UPPER(party_name) = UPPER(v_vendor_name) LIMIT 1;
        IF v_vendor_id IS NULL THEN
            RETURN jsonb_build_object('status','error','message','Vendor "'||v_vendor_name||'" not found.');
        END IF;
    ELSE
        v_vendor_id := get_opening_stock_vendor_id();
    END IF;

    -- gather & validate serials (must exist, be non-empty, unique in payload and system-wide)
    -- and confirm every item resolves to a real item (by id or name) BEFORE any insert.
    FOR v_item IN SELECT value FROM jsonb_array_elements(data->'items') LOOP
        v_item_id := NULLIF(v_item->>'item_id','')::bigint;
        IF v_item_id IS NULL THEN
            SELECT item_id INTO v_item_id FROM items WHERE UPPER(item_name) = UPPER(TRIM(COALESCE(v_item->>'item_name',''))) LIMIT 1;
        END IF;
        IF v_item_id IS NULL THEN
            RETURN jsonb_build_object('status','error','message','Item "'||COALESCE(v_item->>'item_name', v_item->>'item_id','?')||'" not found.');
        END IF;

        v_serials := v_item->'serials';
        IF v_serials IS NULL OR jsonb_array_length(v_serials) = 0 THEN
            RETURN jsonb_build_object('status','error','message','Every item must have at least one serial number.');
        END IF;
        FOR v_serial IN SELECT jsonb_array_elements_text(v_serials) LOOP
            IF TRIM(v_serial) = '' THEN
                RETURN jsonb_build_object('status','error','message','An empty serial number was provided.');
            END IF;
            v_all_serials := array_append(v_all_serials, TRIM(v_serial));
        END LOOP;
    END LOOP;

    SELECT s INTO v_dup FROM (SELECT unnest(v_all_serials) AS s) q GROUP BY s HAVING count(*) > 1 LIMIT 1;
    IF v_dup IS NOT NULL THEN
        RETURN jsonb_build_object('status','error','message','Duplicate serial number in this entry: '||v_dup);
    END IF;
    SELECT serial_number INTO v_dup FROM purchaseunits WHERE serial_number = ANY(v_all_serials) LIMIT 1;
    IF v_dup IS NOT NULL THEN
        RETURN jsonb_build_object('status','error','message','Serial number already exists in the system: '||v_dup);
    END IF;

    -- total cost
    FOR v_item IN SELECT value FROM jsonb_array_elements(data->'items') LOOP
        v_unit_price := (v_item->>'unit_price')::numeric;
        IF v_unit_price IS NULL OR v_unit_price < 0 THEN
            RETURN jsonb_build_object('status','error','message','Invalid unit cost.');
        END IF;
        v_total := v_total + v_unit_price * jsonb_array_length(v_item->'serials');
    END LOOP;

    -- header (opening document)
    INSERT INTO purchaseinvoices(vendor_id, invoice_date, total_amount, is_opening, created_by)
    VALUES (v_vendor_id, v_as_of, v_total, true, v_user)
    RETURNING purchase_invoice_id INTO v_inv_id;

    -- items + serial units (these feed COGS on future sales)
    FOR v_item IN SELECT value FROM jsonb_array_elements(data->'items') LOOP
        v_item_id := NULLIF(v_item->>'item_id','')::bigint;
        IF v_item_id IS NULL THEN
            SELECT item_id INTO v_item_id FROM items WHERE UPPER(item_name) = UPPER(TRIM(COALESCE(v_item->>'item_name',''))) LIMIT 1;
        END IF;
        v_unit_price := (v_item->>'unit_price')::numeric;
        v_serials    := v_item->'serials';
        v_qty        := jsonb_array_length(v_serials);
        v_comment    := NULLIF(TRIM(COALESCE(v_item->>'comment','')), '');

        INSERT INTO purchaseitems(purchase_invoice_id, item_id, quantity, unit_price)
        VALUES (v_inv_id, v_item_id, v_qty, v_unit_price)
        RETURNING purchase_item_id INTO v_pit_id;

        FOR v_serial IN SELECT jsonb_array_elements_text(v_serials) LOOP
            INSERT INTO purchaseunits(purchase_item_id, serial_number, in_stock, serial_comment)
            VALUES (v_pit_id, TRIM(v_serial), true, v_comment);
            v_unit_count := v_unit_count + 1;
        END LOOP;
        v_item_count := v_item_count + 1;
    END LOOP;

    -- GL: Debit Inventory / Credit Opening Balance (OBE). No payable.
    INSERT INTO journalentries(entry_date, description)
    VALUES (v_as_of, 'Opening Stock' || CASE WHEN v_vendor_name IS NOT NULL THEN ' (Vendor: '||v_vendor_name||')' ELSE '' END)
    RETURNING journal_id INTO v_j_id;

    INSERT INTO journallines(journal_id, account_id, debit)  VALUES (v_j_id, v_inv_acc, v_total);
    INSERT INTO journallines(journal_id, account_id, credit) VALUES (v_j_id, v_obe_acc, v_total);

    UPDATE purchaseinvoices SET journal_id = v_j_id WHERE purchase_invoice_id = v_inv_id;

    RETURN jsonb_build_object('status','success','message','Opening stock saved successfully.',
        'opening_stock_id', v_inv_id, 'total_cost', v_total,
        'items', v_item_count, 'units', v_unit_count);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status','error','message', SQLERRM);
END; $$;

-- ---------------------------------------------------------------------------
-- 4. List / details / delete
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_opening_stock_loads_json()
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb;
BEGIN
    SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'opening_stock_id')::bigint DESC), '[]'::jsonb)
    INTO result FROM (
        SELECT jsonb_build_object(
            'opening_stock_id', pi.purchase_invoice_id,
            'as_of_date',       pi.invoice_date,
            'vendor',           CASE WHEN p.party_name = 'OPENING STOCK' THEN NULL ELSE p.party_name END,
            'total_cost',       pi.total_amount,
            'item_count',       (SELECT count(*) FROM purchaseitems x WHERE x.purchase_invoice_id = pi.purchase_invoice_id),
            'unit_count',       (SELECT count(*) FROM purchaseunits u JOIN purchaseitems x ON x.purchase_item_id = u.purchase_item_id WHERE x.purchase_invoice_id = pi.purchase_invoice_id),
            'in_stock_count',   (SELECT count(*) FROM purchaseunits u JOIN purchaseitems x ON x.purchase_item_id = u.purchase_item_id WHERE x.purchase_invoice_id = pi.purchase_invoice_id AND u.in_stock),
            'created_by',       COALESCE(usr.username, 'N/A')
        ) AS r
        FROM purchaseinvoices pi
        JOIN parties p ON p.party_id = pi.vendor_id
        LEFT JOIN auth_user usr ON usr.id = pi.created_by
        WHERE pi.is_opening = true
    ) q;
    RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.get_opening_stock_load_details(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'opening_stock_id', pi.purchase_invoice_id,
        'as_of_date',       pi.invoice_date,
        'vendor',           CASE WHEN p.party_name = 'OPENING STOCK' THEN NULL ELSE p.party_name END,
        'total_cost',       pi.total_amount,
        'created_by',       COALESCE(usr.username, 'N/A'),
        'items', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'item_name',  i.item_name,
                'qty',        x.quantity,
                'unit_price', x.unit_price,
                'serials', (SELECT COALESCE(jsonb_agg(jsonb_build_object('serial', u.serial_number, 'in_stock', u.in_stock) ORDER BY u.serial_number), '[]'::jsonb)
                            FROM purchaseunits u WHERE u.purchase_item_id = x.purchase_item_id)
            )), '[]'::jsonb)
            FROM purchaseitems x JOIN items i ON i.item_id = x.item_id
            WHERE x.purchase_invoice_id = pi.purchase_invoice_id
        )
    ) INTO result
    FROM purchaseinvoices pi
    JOIN parties p ON p.party_id = pi.vendor_id
    LEFT JOIN auth_user usr ON usr.id = pi.created_by
    WHERE pi.purchase_invoice_id = p_id AND pi.is_opening = true;
    RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_opening_stock(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_sold int; v_j bigint;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM purchaseinvoices WHERE purchase_invoice_id = p_id AND is_opening = true) THEN
        RETURN jsonb_build_object('status','error','message','Opening stock entry not found.');
    END IF;

    SELECT count(*) INTO v_sold
    FROM purchaseunits u JOIN purchaseitems x ON x.purchase_item_id = u.purchase_item_id
    WHERE x.purchase_invoice_id = p_id AND u.in_stock = false;
    IF v_sold > 0 THEN
        RETURN jsonb_build_object('status','error','message',
            'Cannot delete: '||v_sold||' unit(s) from this opening stock have already been sold or used.');
    END IF;

    SELECT journal_id INTO v_j FROM purchaseinvoices WHERE purchase_invoice_id = p_id;
    DELETE FROM purchaseinvoices WHERE purchase_invoice_id = p_id;  -- cascades items + units
    IF v_j IS NOT NULL THEN DELETE FROM journalentries WHERE journal_id = v_j; END IF;

    RETURN jsonb_build_object('status','success','message','Opening stock entry deleted.');
END; $$;

-- ---------------------------------------------------------------------------
-- 5. Opening Balance Equity status + one-click reclassification to Capital
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_opening_balance_status_json()
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_obe bigint; v_cap bigint; v_bal numeric; v_cap_bal numeric;
BEGIN
    SELECT account_id INTO v_obe FROM chartofaccounts WHERE account_name = 'Opening Balance'  LIMIT 1;
    SELECT account_id INTO v_cap FROM chartofaccounts WHERE account_name = 'Owner''s Capital'  LIMIT 1;
    SELECT COALESCE(SUM(debit) - SUM(credit), 0) INTO v_bal     FROM journallines WHERE account_id = v_obe;
    SELECT COALESCE(SUM(debit) - SUM(credit), 0) INTO v_cap_bal FROM journallines WHERE account_id = v_cap;
    RETURN jsonb_build_object(
        'obe_balance_dr_cr', v_bal,        -- debit minus credit
        'obe_equity_amount', -v_bal,       -- positive => net credit (normal equity)
        'capital_equity_amount', -v_cap_bal,
        'needs_reclass', (v_bal <> 0)
    );
END; $$;

CREATE OR REPLACE FUNCTION public.reclassify_opening_balance_to_capital(data jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_obe bigint; v_cap bigint; v_bal numeric; v_j bigint;
BEGIN
    SELECT account_id INTO v_obe FROM chartofaccounts WHERE account_name = 'Opening Balance' LIMIT 1;
    SELECT account_id INTO v_cap FROM chartofaccounts WHERE account_name = 'Owner''s Capital' LIMIT 1;
    IF v_obe IS NULL OR v_cap IS NULL THEN
        RETURN jsonb_build_object('status','error','message','Opening Balance / Owner''s Capital account missing.');
    END IF;

    SELECT COALESCE(SUM(debit) - SUM(credit), 0) INTO v_bal FROM journallines WHERE account_id = v_obe;
    IF v_bal = 0 THEN
        RETURN jsonb_build_object('status','noop','message','Opening Balance is already zero — nothing to reclassify.');
    END IF;

    INSERT INTO journalentries(entry_date, description)
    VALUES (CURRENT_DATE, 'Reclassify Opening Balance to Owner''s Capital')
    RETURNING journal_id INTO v_j;

    IF v_bal < 0 THEN          -- OBE carries a net credit (normal): Debit OBE / Credit Capital
        INSERT INTO journallines(journal_id, account_id, debit)  VALUES (v_j, v_obe, -v_bal);
        INSERT INTO journallines(journal_id, account_id, credit) VALUES (v_j, v_cap, -v_bal);
    ELSE                       -- OBE carries a net debit: Credit OBE / Debit Capital
        INSERT INTO journallines(journal_id, account_id, credit) VALUES (v_j, v_obe, v_bal);
        INSERT INTO journallines(journal_id, account_id, debit)  VALUES (v_j, v_cap, v_bal);
    END IF;

    RETURN jsonb_build_object('status','success',
        'message','Opening balances moved into Owner''s Capital.',
        'amount', abs(v_bal), 'journal_id', v_j);
END; $$;

-- ---------------------------------------------------------------------------
-- 6. Anchor ALL opening entries to the dedicated "Opening Balance" account.
--    The three existing functions credit/debit "Owner's Capital" today; this
--    re-points only that equity-anchor lookup to "Opening Balance", leaving
--    every other line of those functions byte-for-byte identical.
-- ---------------------------------------------------------------------------
DO $reanchor$
DECLARE fn text; def text;
BEGIN
    FOREACH fn IN ARRAY ARRAY['trg_party_opening_balance','update_party_from_json','set_opening_cash_from_json']
    LOOP
        SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p WHERE p.proname = fn LIMIT 1;
        IF def IS NOT NULL THEN
            def := replace(def, '''Owner''''s Capital''', '''Opening Balance''');
            EXECUTE def;
        END IF;
    END LOOP;
END $reanchor$;

-- ---------------------------------------------------------------------------
-- 7. Keep opening-stock documents out of the operational Purchases section.
--    Each function below is the original with a single is_opening filter added.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_last_purchase_id()
 RETURNS bigint LANGUAGE plpgsql AS $function$
DECLARE last_id BIGINT;
BEGIN
    SELECT purchase_invoice_id INTO last_id
    FROM PurchaseInvoices
    WHERE NOT COALESCE(is_opening, false)
    ORDER BY purchase_invoice_id DESC
    LIMIT 1;
    RETURN last_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_last_purchase()
 RETURNS json LANGUAGE plpgsql AS $function$
DECLARE last_id BIGINT;
BEGIN
    SELECT purchase_invoice_id INTO last_id
    FROM PurchaseInvoices
    WHERE NOT COALESCE(is_opening, false)
    ORDER BY purchase_invoice_id DESC
    LIMIT 1;
    RETURN get_current_purchase(last_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.get_next_purchase(p_invoice_id bigint)
 RETURNS json LANGUAGE plpgsql AS $function$
DECLARE next_id BIGINT;
BEGIN
    SELECT purchase_invoice_id INTO next_id
    FROM PurchaseInvoices
    WHERE purchase_invoice_id > p_invoice_id
      AND NOT COALESCE(is_opening, false)
    ORDER BY purchase_invoice_id ASC
    LIMIT 1;
    IF next_id IS NULL THEN RETURN NULL; END IF;
    RETURN get_current_purchase(next_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.get_previous_purchase(p_invoice_id bigint)
 RETURNS json LANGUAGE plpgsql AS $function$
DECLARE prev_id BIGINT;
BEGIN
    SELECT purchase_invoice_id INTO prev_id
    FROM PurchaseInvoices
    WHERE purchase_invoice_id < p_invoice_id
      AND NOT COALESCE(is_opening, false)
    ORDER BY purchase_invoice_id DESC
    LIMIT 1;
    IF prev_id IS NULL THEN RETURN NULL; END IF;
    RETURN get_current_purchase(prev_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.get_current_purchase(p_invoice_id bigint)
 RETURNS json LANGUAGE plpgsql AS $function$
DECLARE result JSON;
BEGIN
    SELECT json_build_object(
        'purchase_invoice_id', pi.purchase_invoice_id,
        'Party',               p.party_name,
        'invoice_date',        pi.invoice_date,
        'total_amount',        pi.total_amount,
        'description',         je.description,
        'created_by',          COALESCE(u.username, 'N/A'),
        'items', (
            SELECT json_agg(json_build_object(
                'item_name',  i.item_name,
                'qty',        pi2.quantity,
                'unit_price', pi2.unit_price,
                'serials', (
                    SELECT json_agg(json_build_object('serial', pu.serial_number, 'comment', pu.serial_comment))
                    FROM PurchaseUnits pu
                    WHERE pu.purchase_item_id = pi2.purchase_item_id
                )
            ))
            FROM PurchaseItems pi2
            JOIN Items i ON i.item_id = pi2.item_id
            WHERE pi2.purchase_invoice_id = pi.purchase_invoice_id
        )
    ) INTO result
    FROM PurchaseInvoices pi
    JOIN Parties p ON p.party_id = pi.vendor_id
    LEFT JOIN JournalEntries je ON je.journal_id = pi.journal_id
    LEFT JOIN auth_user u ON u.id = pi.created_by
    WHERE pi.purchase_invoice_id = p_invoice_id
      AND NOT COALESCE(pi.is_opening, false);
    RETURN result;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_purchase_summary(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS json LANGUAGE plpgsql AS $function$
DECLARE result JSON;
BEGIN
    IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
        SELECT json_agg(p ORDER BY p.invoice_date DESC) INTO result
        FROM (
            SELECT pi.purchase_invoice_id, pi.invoice_date, pa.party_name AS vendor, pi.total_amount
            FROM PurchaseInvoices pi
            JOIN Parties pa ON pi.vendor_id = pa.party_id
            WHERE pi.invoice_date BETWEEN p_start_date AND p_end_date
              AND NOT COALESCE(pi.is_opening, false)
            ORDER BY pi.invoice_date DESC
        ) AS p;
    ELSE
        SELECT json_agg(p ORDER BY p.invoice_date DESC) INTO result
        FROM (
            SELECT pi.purchase_invoice_id, pi.invoice_date, pa.party_name AS vendor, pi.total_amount
            FROM PurchaseInvoices pi
            JOIN Parties pa ON pi.vendor_id = pa.party_id
            WHERE NOT COALESCE(pi.is_opening, false)
            ORDER BY pi.invoice_date DESC
            LIMIT 20
        ) AS p;
    END IF;
    RETURN COALESCE(result, '[]'::json);
END; $function$;
