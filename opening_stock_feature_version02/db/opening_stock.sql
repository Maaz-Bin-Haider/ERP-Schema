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
--      items: [ { item_id|item_name, unit_price (cost), comment,
--                 serials:[ {serial, comment} | "serial", ... ] }, ... ]
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
    v_selem       jsonb;
    v_scomment    text;
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
        FOR v_selem IN SELECT value FROM jsonb_array_elements(v_serials) LOOP
            v_serial := CASE WHEN jsonb_typeof(v_selem) = 'object' THEN v_selem->>'serial' ELSE (v_selem #>> '{}') END;
            IF v_serial IS NULL OR TRIM(v_serial) = '' THEN
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

        FOR v_selem IN SELECT value FROM jsonb_array_elements(v_serials) LOOP
            IF jsonb_typeof(v_selem) = 'object' THEN
                v_serial   := v_selem->>'serial';
                v_scomment := NULLIF(TRIM(COALESCE(v_selem->>'comment','')), '');
            ELSE
                v_serial   := v_selem #>> '{}';
                v_scomment := v_comment;
            END IF;
            INSERT INTO purchaseunits(purchase_item_id, serial_number, in_stock, serial_comment)
            VALUES (v_pit_id, TRIM(v_serial), true, COALESCE(v_scomment, v_comment));
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
                'serials', (SELECT COALESCE(jsonb_agg(jsonb_build_object('serial', u.serial_number, 'in_stock', u.in_stock, 'comment', u.serial_comment) ORDER BY u.serial_number), '[]'::jsonb)
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

-- ---------------------------------------------------------------------------
-- 8. Keep opening-stock loads out of FINANCIAL REPORTS & DASHBOARD.
--    Opening stock is equity-funded (its cost lives in Opening Balance /
--    Capital), not a purchase of the period, so it must not appear as a
--    Purchase in the income statement, as a vendor purchase total, or in the
--    recent-transactions feed. (It DOES correctly count as inventory on hand
--    in monthly_company_position — that is intentional and left untouched.)
-- ---------------------------------------------------------------------------

-- 8a. Monthly income statement (Pakistan model: Sales - Purchases - Expenses).
CREATE OR REPLACE FUNCTION public.monthly_income_statement(p_from_date date, p_to_date date)
RETURNS json
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    v_sales_gross     NUMERIC(14,2) := 0;
    v_sales_returns   NUMERIC(14,2) := 0;
    v_total_sales     NUMERIC(14,2) := 0;
    v_purch_gross     NUMERIC(14,2) := 0;
    v_purch_returns   NUMERIC(14,2) := 0;
    v_total_purchases NUMERIC(14,2) := 0;
    v_expenses_json   json := '[]'::json;
    v_total_expenses  NUMERIC(14,2) := 0;
    v_profit_loss     NUMERIC(14,2) := 0;
BEGIN
    -- Sales (net of sales returns) within the period
    SELECT COALESCE(SUM(total_amount), 0) INTO v_sales_gross
    FROM   salesinvoices
    WHERE  invoice_date BETWEEN p_from_date AND p_to_date;

    SELECT COALESCE(SUM(total_amount), 0) INTO v_sales_returns
    FROM   salesreturns
    WHERE  return_date BETWEEN p_from_date AND p_to_date;

    v_total_sales := v_sales_gross - v_sales_returns;

    -- Purchases (net of purchase returns) within the period.
    -- Opening-stock loads are excluded: they are not purchases of the period,
    -- their cost is carried in Opening Balance Equity / Owner's Capital.
    SELECT COALESCE(SUM(total_amount), 0) INTO v_purch_gross
    FROM   purchaseinvoices
    WHERE  invoice_date BETWEEN p_from_date AND p_to_date
      AND  NOT COALESCE(is_opening, false);

    SELECT COALESCE(SUM(total_amount), 0) INTO v_purch_returns
    FROM   purchasereturns
    WHERE  return_date BETWEEN p_from_date AND p_to_date;

    v_total_purchases := v_purch_gross - v_purch_returns;

    SELECT
        COALESCE(json_agg(json_build_object('category', name, 'amount', amt)
                          ORDER BY name) FILTER (WHERE amt <> 0), '[]'::json),
        COALESCE(SUM(amt), 0)
    INTO v_expenses_json, v_total_expenses
    FROM (
        SELECT c.account_name AS name,
               ROUND(COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0), 2) AS amt
        FROM   chartofaccounts c
        JOIN   journallines    jl ON jl.account_id = c.account_id
        JOIN   journalentries  je ON je.journal_id = jl.journal_id
        WHERE  c.account_type = 'Expense'
          AND  c.account_name NOT ILIKE '%cost of goods%'
          AND  je.entry_date BETWEEN p_from_date AND p_to_date
        GROUP  BY c.account_name
    ) ex;

    v_profit_loss := v_total_sales - v_total_purchases - v_total_expenses;

    RETURN json_build_object(
        'from_date',        p_from_date,
        'to_date',          p_to_date,
        'sales_gross',      ROUND(v_sales_gross, 2),
        'sales_returns',    ROUND(v_sales_returns, 2),
        'total_sales',      ROUND(v_total_sales, 2),
        'purchases_gross',  ROUND(v_purch_gross, 2),
        'purchase_returns', ROUND(v_purch_returns, 2),
        'total_purchases',  ROUND(v_total_purchases, 2),
        'expenses',         v_expenses_json,
        'total_expenses',   ROUND(v_total_expenses, 2),
        'profit_loss',      ROUND(v_profit_loss, 2)
    );
END;
$function$;

-- 8b. Dashboard: top vendors by purchase total (exclude opening loads).
CREATE OR REPLACE FUNCTION public.fn_dash_top_vendors(p_limit integer DEFAULT 5, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS json LANGUAGE plpgsql STABLE
AS $function$
DECLARE
    v_result JSON;
    v_from   DATE := COALESCE(p_from, '2000-01-01'::date);
    v_to     DATE := COALESCE(p_to,   CURRENT_DATE);
BEGIN
    SELECT json_agg(
        json_build_object(
            'party_id',       party_id,
            'party_name',     party_name,
            'contact',        contact,
            'invoice_count',  invoice_count,
            'total_purchased',total_purchased,
            'last_purchase',  last_purchase
        )
        ORDER BY total_purchased DESC
    )
    INTO v_result
    FROM (
        SELECT
            p.party_id,
            p.party_name,
            COALESCE(p.contact_info, 'N/A')              AS contact,
            COUNT(DISTINCT pi.purchase_invoice_id)        AS invoice_count,
            COALESCE(SUM(pi.total_amount), 0)             AS total_purchased,
            TO_CHAR(MAX(pi.invoice_date), 'YYYY-MM-DD')  AS last_purchase
        FROM parties p
        JOIN purchaseinvoices pi ON pi.vendor_id = p.party_id
        WHERE pi.invoice_date BETWEEN v_from AND v_to
          AND NOT COALESCE(pi.is_opening, false)
        GROUP BY p.party_id, p.party_name, p.contact_info
        ORDER BY SUM(pi.total_amount) DESC
        LIMIT p_limit
    ) subq;

    RETURN COALESCE(v_result, '[]'::json);
END;
$function$;

-- 8c. Dashboard: recent transactions feed (exclude opening loads from Purchases).
CREATE OR REPLACE FUNCTION public.fn_dash_recent_transactions(p_limit integer DEFAULT 10)
 RETURNS json LANGUAGE plpgsql STABLE
AS $function$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(
        json_build_object(
            'type',       row_data.txn_type,
            'icon',       row_data.txn_icon,
            'ref_id',     row_data.ref_id,
            'party_name', row_data.party_name,
            'amount',     row_data.amount,
            'txn_date',   row_data.txn_date
        )
        ORDER BY row_data.txn_date DESC, row_data.ref_id DESC
    )
    INTO v_result
    FROM (
        SELECT
            'Sale'                                    AS txn_type,
            'sale'                                    AS txn_icon,
            si.sales_invoice_id                       AS ref_id,
            p.party_name                              AS party_name,
            si.total_amount                           AS amount,
            TO_CHAR(si.invoice_date, 'YYYY-MM-DD')   AS txn_date
        FROM salesinvoices si
        JOIN parties p ON p.party_id = si.customer_id

        UNION ALL

        SELECT
            'Purchase',
            'purchase',
            pi.purchase_invoice_id,
            p.party_name,
            pi.total_amount,
            TO_CHAR(pi.invoice_date, 'YYYY-MM-DD')
        FROM purchaseinvoices pi
        JOIN parties p ON p.party_id = pi.vendor_id
        WHERE NOT COALESCE(pi.is_opening, false)

        UNION ALL

        SELECT
            'Receipt',
            'receipt',
            r.receipt_id,
            p.party_name,
            r.amount,
            TO_CHAR(r.receipt_date, 'YYYY-MM-DD')
        FROM receipts r
        JOIN parties p ON p.party_id = r.party_id

        UNION ALL

        SELECT
            'Payment',
            'payment',
            pay.payment_id,
            p.party_name,
            pay.amount,
            TO_CHAR(pay.payment_date, 'YYYY-MM-DD')
        FROM payments pay
        JOIN parties p ON p.party_id = pay.party_id

        ORDER BY txn_date DESC, ref_id DESC
        LIMIT p_limit
    ) row_data;

    RETURN COALESCE(v_result, '[]'::json);
END;
$function$;
