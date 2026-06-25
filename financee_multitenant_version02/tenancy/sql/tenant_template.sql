-- ============================================================================
--  tenant_template.sql
--  ---------------------------------------------------------------------------
--  Schema-RELATIVE definition of every TENANT (per-company) database object:
--  22 tables, 171 functions, 14 views, 11 triggers, 21 sequences,
--  plus the structural Chart-of-Accounts seed.
--
--  This file is REPLAYED INTO A TENANT SCHEMA. It must be run with the target
--  schema first on the search_path, e.g.:
--
--      CREATE SCHEMA IF NOT EXISTS tenant_company_1;
--      SET check_function_bodies = false;        -- allow forward refs
--      SET search_path TO tenant_company_1, public;
--      \i tenant_template.sql
--      SET search_path TO public;                -- reset
--
--  All business objects are UNQUALIFIED so they resolve into the active schema.
--  Cross-schema references to the SHARED user table stay public.auth_user.
--  Generated from build_current_db_version10.sql (do not edit by hand).
-- ============================================================================

SET check_function_bodies = false;

--
-- Name: add_item_from_json(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION add_item_from_json(item_data jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO Items(item_name, storage, sale_price, item_code, category, brand,
                      created_at, updated_at, created_by)
    VALUES (
        item_data->>'item_name',
        COALESCE(item_data->>'storage', 'Main Warehouse'),
        COALESCE((item_data->>'sale_price')::NUMERIC, 0.00),
        NULLIF(item_data->>'item_code', ''),
        NULLIF(item_data->>'category', ''),
        NULLIF(item_data->>'brand', ''),
        COALESCE((item_data->>'created_at')::TIMESTAMP, NOW()),
        COALESCE((item_data->>'updated_at')::TIMESTAMP, NOW()),
        NULLIF(item_data->>'created_by_id', '')::INTEGER
    );
END;
$$;
--
-- Name: add_party_from_json(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION add_party_from_json(party_data jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_party_type TEXT := TRIM(BOTH '"' FROM party_data->>'party_type');
    v_party_name TEXT := TRIM(BOTH '"' FROM party_data->>'party_name');
    v_opening_balance NUMERIC := COALESCE((party_data->>'opening_balance')::NUMERIC, 0);
    v_balance_type TEXT := COALESCE(party_data->>'balance_type', 'Debit');
    v_expense_account_id BIGINT;
BEGIN
    -- Handle Expense-type Party (auto-create its expense COA account)
    IF v_party_type = 'Expense' THEN
        -- Check if Expense account already exists in COA
        SELECT account_id INTO v_expense_account_id
        FROM ChartOfAccounts
        WHERE account_name ILIKE v_party_name
          AND account_type = 'Expense'
        LIMIT 1;

        -- Create a new Expense account if not found
        IF v_expense_account_id IS NULL THEN
            INSERT INTO ChartOfAccounts (
                account_code, account_name, account_type, parent_account, date_created
            )
            VALUES (
                CONCAT('EXP-', LPAD((SELECT COUNT(*) + 1 FROM ChartOfAccounts WHERE account_type='Expense')::TEXT, 4, '0')),
                v_party_name,
                'Expense',
                (SELECT account_id FROM ChartOfAccounts WHERE account_name ILIKE 'Expenses' LIMIT 1),
                CURRENT_TIMESTAMP
            )
            RETURNING account_id INTO v_expense_account_id;
        END IF;
    END IF;

    -- Insert into Parties table
    INSERT INTO Parties (
        party_name, party_type, contact_info, address,
        opening_balance, balance_type,
        ar_account_id, ap_account_id, created_by
    )
    VALUES (
        v_party_name,
        v_party_type,
        party_data->>'contact_info',
        party_data->>'address',
        v_opening_balance,
        v_balance_type,
        CASE 
            WHEN v_party_type IN ('Customer','Both','Expense') THEN 
                (SELECT account_id FROM ChartOfAccounts WHERE account_name ILIKE 'Accounts Receivable' LIMIT 1)
            ELSE NULL 
        END,
        CASE 
            WHEN v_party_type IN ('Vendor','Both') THEN 
                (SELECT account_id FROM ChartOfAccounts WHERE account_name ILIKE 'Accounts Payable' LIMIT 1)
            WHEN v_party_type = 'Expense' THEN 
                v_expense_account_id
            ELSE NULL 
        END,
        NULLIF(party_data->>'created_by_id', '')::INTEGER
    );
END;
$$;
--
-- Name: create_purchase(bigint, date, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION create_purchase(p_party_id bigint, p_invoice_date date, p_items jsonb) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_invoice_id BIGINT;
    v_purchase_item_id BIGINT;
    v_total NUMERIC(14,2) := 0;
    v_item_id BIGINT;
    v_item JSONB;
    v_serial JSONB;
BEGIN
    -- 1. Create Purchase Invoice (header)
    INSERT INTO PurchaseInvoices(vendor_id, invoice_date, total_amount)
    VALUES (p_party_id, p_invoice_date, 0)
    RETURNING purchase_invoice_id INTO v_invoice_id;

    -- 2. Loop through items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Resolve item_id from item_name
        SELECT item_id INTO v_item_id
        FROM Items
        WHERE item_name = (v_item->>'item_name')
        LIMIT 1;

        IF v_item_id IS NULL THEN
            -- Optionally auto-create item if not found
            INSERT INTO Items(item_name, sale_price)
            VALUES ((v_item->>'item_name'), (v_item->>'unit_price')::NUMERIC)
            RETURNING item_id INTO v_item_id;
        END IF;

        -- Insert purchase item
        INSERT INTO PurchaseItems(purchase_invoice_id, item_id, quantity, unit_price)
        VALUES (
            v_invoice_id,
            v_item_id,
            (v_item->>'qty')::INT,
            (v_item->>'unit_price')::NUMERIC
        )
        RETURNING purchase_item_id INTO v_purchase_item_id;

        -- Accumulate total
        v_total := v_total + ((v_item->>'qty')::INT * (v_item->>'unit_price')::NUMERIC);

        -- Insert purchase units (serials) with comments into stock
        FOR v_serial IN SELECT * FROM jsonb_array_elements(v_item->'serials')
        LOOP
            INSERT INTO PurchaseUnits(purchase_item_id, serial_number, serial_comment, in_stock)
            VALUES (
                v_purchase_item_id, 
                v_serial->>'serial', 
                NULLIF(TRIM(COALESCE(v_serial->>'comment', '')), ''),
                TRUE
            );

            -- Insert stock movement (IN) for audit trail
            INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
            VALUES (v_item_id, v_serial->>'serial', 'IN', 'PurchaseInvoice', v_invoice_id, 1);
        END LOOP;
    END LOOP;

    -- 3. Update invoice total
    UPDATE PurchaseInvoices
    SET total_amount = v_total
    WHERE purchase_invoice_id = v_invoice_id;

    -- 4. Build Journal Entry (explicit, no trigger needed)
    PERFORM rebuild_purchase_journal(v_invoice_id);

    RETURN v_invoice_id;
END;
$$;
--
-- Name: create_purchase(bigint, date, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION create_purchase(p_party_id bigint, p_invoice_date date, p_items jsonb, p_created_by integer DEFAULT NULL::integer) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_invoice_id       BIGINT;
    v_purchase_item_id BIGINT;
    v_total            NUMERIC(14,2) := 0;
    v_item_id          BIGINT;
    v_item             JSONB;
    v_serial           JSONB;
BEGIN
    INSERT INTO PurchaseInvoices(vendor_id, invoice_date, total_amount, created_by)
    VALUES (p_party_id, p_invoice_date, 0, p_created_by)
    RETURNING purchase_invoice_id INTO v_invoice_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT item_id INTO v_item_id FROM Items
        WHERE item_name = (v_item->>'item_name') LIMIT 1;
        IF v_item_id IS NULL THEN
            INSERT INTO Items(item_name, sale_price)
            VALUES ((v_item->>'item_name'), (v_item->>'unit_price')::NUMERIC)
            RETURNING item_id INTO v_item_id;
        END IF;

        INSERT INTO PurchaseItems(purchase_invoice_id, item_id, quantity, unit_price)
        VALUES (v_invoice_id, v_item_id, (v_item->>'qty')::INT, (v_item->>'unit_price')::NUMERIC)
        RETURNING purchase_item_id INTO v_purchase_item_id;

        v_total := v_total + ((v_item->>'qty')::INT * (v_item->>'unit_price')::NUMERIC);

        FOR v_serial IN SELECT * FROM jsonb_array_elements(v_item->'serials')
        LOOP
            INSERT INTO PurchaseUnits(purchase_item_id, serial_number, serial_comment, in_stock)
            VALUES (v_purchase_item_id, v_serial->>'serial',
                    NULLIF(TRIM(COALESCE(v_serial->>'comment', '')), ''), TRUE);
            INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
            VALUES (v_item_id, v_serial->>'serial', 'IN', 'PurchaseInvoice', v_invoice_id, 1);
        END LOOP;
    END LOOP;

    UPDATE PurchaseInvoices SET total_amount = v_total WHERE purchase_invoice_id = v_invoice_id;
    PERFORM rebuild_purchase_journal(v_invoice_id);
    RETURN v_invoice_id;
END;
$$;
--
-- Name: create_purchase_return(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION create_purchase_return(p_party_name text, p_serials jsonb) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_party_id BIGINT;
    v_return_id BIGINT;
    v_serial TEXT;
    v_unit RECORD;
    v_total NUMERIC(14,2) := 0;
BEGIN
    -- 1. Find Vendor
    SELECT party_id INTO v_party_id
    FROM Parties
    WHERE party_name = p_party_name;

    IF v_party_id IS NULL THEN
        RAISE EXCEPTION 'Vendor % not found', p_party_name;
    END IF;

    -- 2. Create Return Header
    INSERT INTO PurchaseReturns(vendor_id, return_date, total_amount)
    VALUES (v_party_id, CURRENT_DATE, 0)
    RETURNING purchase_return_id INTO v_return_id;

    -- 3. Process each serial
    FOR v_serial IN SELECT jsonb_array_elements_text(p_serials)
    LOOP
        SELECT pu.unit_id, pu.serial_number, pi.item_id, pi.unit_price, p.vendor_id, p.purchase_invoice_id
        INTO v_unit
        FROM PurchaseUnits pu
        JOIN PurchaseItems pi ON pu.purchase_item_id = pi.purchase_item_id
        JOIN PurchaseInvoices p ON pi.purchase_invoice_id = p.purchase_invoice_id
        WHERE pu.serial_number = v_serial;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Serial % not found in PurchaseUnits', v_serial;
        END IF;

        -- check if in stock
        IF NOT EXISTS (
            SELECT 1 FROM PurchaseUnits WHERE unit_id = v_unit.unit_id AND in_stock = TRUE
        ) THEN
            RAISE EXCEPTION 'Serial % is not currently in stock', v_serial;
        END IF;

        -- check vendor match
        IF v_unit.vendor_id <> v_party_id THEN
            RAISE EXCEPTION 'Serial % was purchased from a different vendor', v_serial;
        END IF;

        -- mark as returned (remove from stock)
        UPDATE PurchaseUnits 
        SET in_stock = FALSE 
        WHERE unit_id = v_unit.unit_id;

        -- log stock OUT
        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (v_unit.item_id, v_serial, 'OUT', 'PurchaseReturn', v_return_id, 1);

        -- insert return line (✅ unit_price instead of cost_price)
        INSERT INTO PurchaseReturnItems(purchase_return_id, item_id, unit_price, serial_number)
        VALUES (v_return_id, v_unit.item_id, v_unit.unit_price, v_serial);

        -- accumulate total
        v_total := v_total + v_unit.unit_price;
    END LOOP;

    -- 4. Update header total
    UPDATE PurchaseReturns
    SET total_amount = v_total
    WHERE purchase_return_id = v_return_id;

    -- 5. Build Journal
    PERFORM rebuild_purchase_return_journal(v_return_id);

    RETURN v_return_id;
END;
$$;
--
-- Name: create_purchase_return(text, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION create_purchase_return(p_party_name text, p_serials jsonb, p_created_by integer DEFAULT NULL::integer) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_return_id BIGINT;
    v_vendor_id BIGINT;
    v_serial    TEXT;
    v_rec       RECORD;
    v_total     NUMERIC(14,2) := 0;
BEGIN
    SELECT party_id INTO v_vendor_id FROM Parties WHERE party_name = p_party_name LIMIT 1;
    IF v_vendor_id IS NULL THEN
        RAISE EXCEPTION 'Vendor "%" not found', p_party_name;
    END IF;

    INSERT INTO PurchaseReturns(vendor_id, return_date, total_amount, created_by)
    VALUES (v_vendor_id, CURRENT_DATE, 0, p_created_by)
    RETURNING purchase_return_id INTO v_return_id;

    FOR v_serial IN SELECT jsonb_array_elements_text(p_serials)
    LOOP
        SELECT pu.unit_id, pu.purchase_item_id, pi2.unit_price, pi2.item_id,
               pi2.purchase_invoice_id, pu.serial_number
        INTO v_rec
        FROM PurchaseUnits pu
        JOIN PurchaseItems pi2 ON pu.purchase_item_id = pi2.purchase_item_id
        JOIN PurchaseInvoices pinv ON pi2.purchase_invoice_id = pinv.purchase_invoice_id
        WHERE pu.serial_number = v_serial AND pinv.vendor_id = v_vendor_id;

        IF NOT FOUND THEN RAISE EXCEPTION 'Serial % not found for this vendor', v_serial; END IF;

        UPDATE PurchaseUnits SET in_stock = FALSE WHERE unit_id = v_rec.unit_id;

        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (v_rec.item_id, v_serial, 'OUT', 'PurchaseReturn', v_return_id, 1);

        INSERT INTO PurchaseReturnItems(purchase_return_id, item_id, unit_price, serial_number)
        VALUES (v_return_id, v_rec.item_id, v_rec.unit_price, v_serial);

        v_total := v_total + v_rec.unit_price;
    END LOOP;

    UPDATE PurchaseReturns SET total_amount = v_total WHERE purchase_return_id = v_return_id;
    PERFORM rebuild_purchase_return_journal(v_return_id);
    RETURN v_return_id;
END;
$$;
--
-- Name: create_sale(bigint, date, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION create_sale(p_party_id bigint, p_invoice_date date, p_items jsonb) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_invoice_id BIGINT;
    v_sales_item_id BIGINT;
    v_total NUMERIC(14,2) := 0;
    v_unit_id BIGINT;
    v_serial TEXT;
    v_item_id BIGINT;
    v_item JSONB;
BEGIN
    -- 1. Create Invoice (header)
    INSERT INTO SalesInvoices(customer_id, invoice_date, total_amount)
    VALUES (p_party_id, p_invoice_date, 0)
    RETURNING sales_invoice_id INTO v_invoice_id;

    -- 2. Loop through items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Resolve item_id from item_name
        SELECT item_id INTO v_item_id
        FROM Items
        WHERE item_name = (v_item->>'item_name')
        LIMIT 1;

        IF v_item_id IS NULL THEN
            RAISE EXCEPTION 'Item "%" not found in Items table', (v_item->>'item_name');
        END IF;

        -- Insert sales item
        INSERT INTO SalesItems(sales_invoice_id, item_id, quantity, unit_price)
        VALUES (
            v_invoice_id,
            v_item_id,
            (v_item->>'qty')::INT,
            (v_item->>'unit_price')::NUMERIC
        )
        RETURNING sales_item_id INTO v_sales_item_id;

        -- Accumulate total
        v_total := v_total + ((v_item->>'qty')::INT * (v_item->>'unit_price')::NUMERIC);

        -- Insert sold units from serials
        FOR v_serial IN SELECT jsonb_array_elements_text(v_item->'serials')
        LOOP
            -- find unit_id for this serial
            SELECT unit_id INTO v_unit_id
            FROM PurchaseUnits
            WHERE serial_number = v_serial
              AND in_stock = TRUE
            LIMIT 1;

            IF v_unit_id IS NULL THEN
                RAISE EXCEPTION 'Serial % not found or already sold', v_serial;
            END IF;

            -- insert sold unit
            INSERT INTO SoldUnits(sales_item_id, unit_id, sold_price, status)
            VALUES (v_sales_item_id, v_unit_id, (v_item->>'unit_price')::NUMERIC, 'Sold');

            -- mark purchase unit as not in stock
            UPDATE PurchaseUnits
            SET in_stock = FALSE
            WHERE unit_id = v_unit_id;

            -- log stock movement (OUT)
            INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
            VALUES (v_item_id, v_serial, 'OUT', 'SalesInvoice', v_invoice_id, 1);
        END LOOP;
    END LOOP;

    -- 3. Update invoice total
    UPDATE SalesInvoices
    SET total_amount = v_total
    WHERE sales_invoice_id = v_invoice_id;

    -- 4. Build Journal Entry (explicit, no trigger needed)
    PERFORM rebuild_sales_journal(v_invoice_id);

    RETURN v_invoice_id;
END;
$$;
--
-- Name: create_sale(bigint, date, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION create_sale(p_party_id bigint, p_invoice_date date, p_items jsonb, p_created_by integer DEFAULT NULL::integer) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_invoice_id    BIGINT;
    v_sales_item_id BIGINT;
    v_total         NUMERIC(14,2) := 0;
    v_unit_id       BIGINT;
    v_serial        TEXT;
    v_item_id       BIGINT;
    v_item          JSONB;
BEGIN
    INSERT INTO SalesInvoices(customer_id, invoice_date, total_amount, created_by)
    VALUES (p_party_id, p_invoice_date, 0, p_created_by)
    RETURNING sales_invoice_id INTO v_invoice_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT item_id INTO v_item_id FROM Items
        WHERE item_name = (v_item->>'item_name') LIMIT 1;
        IF v_item_id IS NULL THEN
            RAISE EXCEPTION 'Item "%" not found in Items table', (v_item->>'item_name');
        END IF;

        INSERT INTO SalesItems(sales_invoice_id, item_id, quantity, unit_price)
        VALUES (v_invoice_id, v_item_id, (v_item->>'qty')::INT, (v_item->>'unit_price')::NUMERIC)
        RETURNING sales_item_id INTO v_sales_item_id;

        v_total := v_total + ((v_item->>'qty')::INT * (v_item->>'unit_price')::NUMERIC);

        FOR v_serial IN SELECT jsonb_array_elements_text(v_item->'serials')
        LOOP
            SELECT unit_id INTO v_unit_id FROM PurchaseUnits
            WHERE serial_number = v_serial AND in_stock = TRUE LIMIT 1;
            IF v_unit_id IS NULL THEN
                RAISE EXCEPTION 'Serial % not found or already sold', v_serial;
            END IF;
            INSERT INTO SoldUnits(sales_item_id, unit_id, sold_price, status)
            VALUES (v_sales_item_id, v_unit_id, (v_item->>'unit_price')::NUMERIC, 'Sold');
            UPDATE PurchaseUnits SET in_stock = FALSE WHERE unit_id = v_unit_id;
            INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
            VALUES (v_item_id, v_serial, 'OUT', 'SalesInvoice', v_invoice_id, 1);
        END LOOP;
    END LOOP;

    UPDATE SalesInvoices SET total_amount = v_total WHERE sales_invoice_id = v_invoice_id;
    PERFORM rebuild_sales_journal(v_invoice_id);
    RETURN v_invoice_id;
END;
$$;
--
-- Name: create_sale_return(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION create_sale_return(p_party_name text, p_serials jsonb) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_party_id BIGINT;
    v_return_id BIGINT;
    v_serial TEXT;
    v_unit RECORD;
    v_total NUMERIC(14,2) := 0;
    v_cost NUMERIC(14,2) := 0;
BEGIN
    SELECT party_id INTO v_party_id
    FROM Parties
    WHERE party_name = p_party_name;

    IF v_party_id IS NULL THEN
        RAISE EXCEPTION 'Customer % not found', p_party_name;
    END IF;

    INSERT INTO SalesReturns(customer_id, return_date, total_amount)
    VALUES (v_party_id, CURRENT_DATE, 0)
    RETURNING sales_return_id INTO v_return_id;

    FOR v_serial IN SELECT jsonb_array_elements_text(p_serials)
    LOOP
        SELECT su.sold_unit_id, su.unit_id, su.sold_price, si.item_id,
               si.sales_invoice_id, pu.serial_number, pi.unit_price, s.customer_id
        INTO v_unit
        FROM SoldUnits su
        JOIN SalesItems si ON su.sales_item_id = si.sales_item_id
        JOIN SalesInvoices s ON si.sales_invoice_id = s.sales_invoice_id
        JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
        JOIN PurchaseItems pi ON pu.purchase_item_id = pi.purchase_item_id
        WHERE pu.serial_number = v_serial
          AND su.status = 'Sold';  -- only fetch the active sold record

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Serial % not found in SoldUnits or is not currently in Sold status', v_serial;
        END IF;

        IF v_unit.customer_id <> v_party_id THEN
            RAISE EXCEPTION 'Serial % was not sold to %', v_serial, p_party_name;
        END IF;

        UPDATE SoldUnits SET status = 'Returned' WHERE sold_unit_id = v_unit.sold_unit_id;
        UPDATE PurchaseUnits SET in_stock = TRUE WHERE unit_id = v_unit.unit_id;

        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (v_unit.item_id, v_serial, 'IN', 'SalesReturn', v_return_id, 1);

        INSERT INTO SalesReturnItems(sales_return_id, item_id, sold_price, cost_price, serial_number)
        VALUES (v_return_id, v_unit.item_id, v_unit.sold_price, v_unit.unit_price, v_serial);

        v_total := v_total + v_unit.sold_price;
        v_cost := v_cost + v_unit.unit_price;
    END LOOP;

    UPDATE SalesReturns
    SET total_amount = v_total
    WHERE sales_return_id = v_return_id;

    PERFORM rebuild_sales_return_journal(v_return_id);

    RETURN v_return_id;
END;
$$;
--
-- Name: create_sale_return(text, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION create_sale_return(p_party_name text, p_serials jsonb, p_created_by integer DEFAULT NULL::integer) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_return_id   BIGINT;
    v_customer_id BIGINT;
    v_serial      TEXT;
    v_unit        RECORD;
    v_total       NUMERIC(14,2) := 0;
BEGIN
    SELECT party_id INTO v_customer_id FROM Parties WHERE party_name = p_party_name LIMIT 1;
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Party "%" not found', p_party_name;
    END IF;

    INSERT INTO SalesReturns(customer_id, return_date, total_amount, created_by)
    VALUES (v_customer_id, CURRENT_DATE, 0, p_created_by)
    RETURNING sales_return_id INTO v_return_id;

    FOR v_serial IN SELECT jsonb_array_elements_text(p_serials)
    LOOP
        SELECT su.sold_unit_id, su.unit_id, su.sold_price, si.item_id,
               si.sales_invoice_id, pu.serial_number, pi2.unit_price, s.customer_id
        INTO v_unit
        FROM SoldUnits su
        JOIN SalesItems si ON su.sales_item_id = si.sales_item_id
        JOIN SalesInvoices s ON si.sales_invoice_id = s.sales_invoice_id
        JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
        JOIN PurchaseItems pi2 ON pu.purchase_item_id = pi2.purchase_item_id
        WHERE pu.serial_number = v_serial;

        IF NOT FOUND THEN RAISE EXCEPTION 'Serial % not found in SoldUnits', v_serial; END IF;
        IF v_unit.customer_id <> v_customer_id THEN
            RAISE EXCEPTION 'Serial % was not sold to this customer', v_serial;
        END IF;

        UPDATE SoldUnits SET status = 'Returned' WHERE sold_unit_id = v_unit.sold_unit_id;
        UPDATE PurchaseUnits SET in_stock = TRUE WHERE unit_id = v_unit.unit_id;

        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (v_unit.item_id, v_serial, 'IN', 'SalesReturn', v_return_id, 1);

        INSERT INTO SalesReturnItems(sales_return_id, item_id, sold_price, cost_price, serial_number)
        VALUES (v_return_id, v_unit.item_id, v_unit.sold_price, v_unit.unit_price, v_serial);

        v_total := v_total + v_unit.sold_price;
    END LOOP;

    UPDATE SalesReturns SET total_amount = v_total WHERE sales_return_id = v_return_id;
    PERFORM rebuild_sales_return_journal(v_return_id);
    RETURN v_return_id;
END;
$$;
--
-- Name: delete_payment(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION delete_payment(p_payment_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM Payments WHERE payment_id = p_payment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment ID % not found', p_payment_id;
    END IF;

    RETURN jsonb_build_object(
        'status','success',
        'message','Payment deleted successfully',
        'payment_id',p_payment_id
    );
END;
$$;
--
-- Name: delete_purchase(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION delete_purchase(p_invoice_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    rec RECORD;
    j_id BIGINT;
BEGIN
    -- 1. Capture the related journal_id (if any)
    SELECT journal_id INTO j_id
    FROM PurchaseInvoices
    WHERE purchase_invoice_id = p_invoice_id;

    -- 2. Log stock OUT movements before deleting
    FOR rec IN
        SELECT pu.serial_number, pi.item_id, pu.purchase_item_id
        FROM PurchaseUnits pu
        JOIN PurchaseItems pi ON pi.purchase_item_id = pu.purchase_item_id
        WHERE pi.purchase_invoice_id = p_invoice_id
    LOOP
        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (rec.item_id, rec.serial_number, 'OUT', 'PurchaseInvoice-Delete', p_invoice_id, 1);
    END LOOP;

    -- 3. Delete purchase units (serials)
    DELETE FROM PurchaseUnits
    WHERE purchase_item_id IN (
        SELECT purchase_item_id FROM PurchaseItems WHERE purchase_invoice_id = p_invoice_id
    );

    -- 4. Delete purchase items
    DELETE FROM PurchaseItems
    WHERE purchase_invoice_id = p_invoice_id;

    -- 5. Delete journal lines + journal entry if exists
    IF j_id IS NOT NULL THEN
        DELETE FROM JournalLines WHERE journal_id = j_id;
        DELETE FROM JournalEntries WHERE journal_id = j_id;
    END IF;

    -- 6. Delete the purchase invoice itself
    DELETE FROM PurchaseInvoices
    WHERE purchase_invoice_id = p_invoice_id;

END;
$$;
--
-- Name: delete_purchase_return(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION delete_purchase_return(p_return_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    rec RECORD;
    v_vendor_id BIGINT;
    v_unit_vendor_id BIGINT;
    v_journal_id BIGINT;
BEGIN
    -- 1. Get vendor id from return header
    SELECT vendor_id, journal_id
    INTO v_vendor_id, v_journal_id
    FROM PurchaseReturns
    WHERE purchase_return_id = p_return_id;

    IF v_vendor_id IS NULL THEN
        RAISE EXCEPTION 'Purchase Return % not found', p_return_id;
    END IF;

    -- 2. Restore stock for returned items
    FOR rec IN
        SELECT serial_number, item_id
        FROM PurchaseReturnItems
        WHERE purchase_return_id = p_return_id
    LOOP
        -- fetch the vendor of the original purchase for safety
        SELECT p.vendor_id
        INTO v_unit_vendor_id
        FROM PurchaseUnits pu
        JOIN PurchaseItems pi ON pu.purchase_item_id = pi.purchase_item_id
        JOIN PurchaseInvoices p ON pi.purchase_invoice_id = p.purchase_invoice_id
        WHERE pu.serial_number = rec.serial_number;

        IF v_unit_vendor_id IS DISTINCT FROM v_vendor_id THEN
            RAISE EXCEPTION 'Serial % does not belong to vendor % (return %)', 
                rec.serial_number, v_vendor_id, p_return_id;
        END IF;

        -- restore in stock
        UPDATE PurchaseUnits
        SET in_stock = TRUE
        WHERE serial_number = rec.serial_number;

        -- log stock IN
        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (rec.item_id, rec.serial_number, 'IN', 'PurchaseReturn-Delete', p_return_id, 1);
    END LOOP;

    -- 3. Remove journal (if exists)
    IF v_journal_id IS NOT NULL THEN
        DELETE FROM JournalEntries WHERE journal_id = v_journal_id;
    END IF;

    -- 4. Delete return items
    DELETE FROM PurchaseReturnItems WHERE purchase_return_id = p_return_id;

    -- 5. Delete return header
    DELETE FROM PurchaseReturns WHERE purchase_return_id = p_return_id;
END;
$$;
--
-- Name: delete_receipt(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION delete_receipt(p_receipt_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM Receipts WHERE receipt_id = p_receipt_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Receipt ID % not found', p_receipt_id;
    END IF;

    RETURN jsonb_build_object(
        'status','success',
        'message','Receipt deleted successfully',
        'receipt_id',p_receipt_id
    );
END;
$$;
--
-- Name: delete_sale(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION delete_sale(p_invoice_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    rec RECORD;
    v_journal_id BIGINT;
BEGIN
    -- 1. Restore stock for all sold units of this sale
    FOR rec IN
        SELECT su.unit_id, pu.serial_number, si.item_id
        FROM SoldUnits su
        JOIN SalesItems si ON su.sales_item_id = si.sales_item_id
        JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
        WHERE si.sales_invoice_id = p_invoice_id
    LOOP
        -- restore stock
        UPDATE PurchaseUnits
        SET in_stock = TRUE
        WHERE unit_id = rec.unit_id;

        -- log stock movement (IN)
        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (rec.item_id, rec.serial_number, 'IN', 'SalesInvoice-Delete', p_invoice_id, 1);
    END LOOP;

    -- 2. Delete associated journal entries (accounting)
    SELECT journal_id INTO v_journal_id
    FROM SalesInvoices
    WHERE sales_invoice_id = p_invoice_id;

    IF v_journal_id IS NOT NULL THEN
        DELETE FROM JournalLines WHERE journal_id = v_journal_id;
        DELETE FROM JournalEntries WHERE journal_id = v_journal_id;
    END IF;

    -- 3. Delete the invoice (cascade removes SalesItems + SoldUnits)
    DELETE FROM SalesInvoices
    WHERE sales_invoice_id = p_invoice_id;

END;
$$;
--
-- Name: delete_sale_return(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION delete_sale_return(p_return_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    rec RECORD;
	v_journal_id BIGINT;
BEGIN
    -- 1. Revert each returned unit
    FOR rec IN
        SELECT sri.serial_number, sri.item_id
        FROM SalesReturnItems sri
        WHERE sri.sales_return_id = p_return_id
    LOOP
        -- mark sold unit back as Sold
        UPDATE SoldUnits
        SET status = 'Sold'
        WHERE unit_id = (
            SELECT unit_id
            FROM PurchaseUnits
            WHERE serial_number = rec.serial_number
            LIMIT 1
        );

        -- remove from stock again
        UPDATE PurchaseUnits
        SET in_stock = FALSE
        WHERE serial_number = rec.serial_number;

        -- log stock OUT
        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (rec.item_id, rec.serial_number, 'OUT', 'SalesReturn-Delete', p_return_id, 1);
    END LOOP;

	-- 2. Remove journal (if exists)
    SELECT journal_id INTO v_journal_id
    FROM SalesReturns
    WHERE sales_return_id = p_return_id;

	IF v_journal_id IS NOT NULL THEN
        DELETE FROM JournalEntries WHERE journal_id = v_journal_id;
    END IF;

    -- 2. Delete return items
    DELETE FROM SalesReturnItems WHERE sales_return_id = p_return_id;

    -- 4. Delete return header (triggers remove journal)
    DELETE FROM SalesReturns WHERE sales_return_id = p_return_id;
END;
$$;
--
-- Name: detailed_ledger(text, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION detailed_ledger(p_party_name text, p_start_date date, p_end_date date) RETURNS TABLE(entry_date date, journal_id bigint, description text, party_name text, account_type text, debit numeric, credit numeric, running_balance numeric, created_by text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    WITH party_ledger AS (
        SELECT
            je.entry_date                   AS entry_date,
            je.journal_id                   AS journal_id,
            je.description::TEXT            AS description,
            p.party_name::TEXT              AS party_name,
            a.account_name::TEXT            AS account_name,
            jl.debit                        AS debit,
            jl.credit                       AS credit,
            (jl.debit - jl.credit)          AS amount
        FROM JournalLines jl
        JOIN JournalEntries je  ON jl.journal_id  = je.journal_id
        JOIN ChartOfAccounts a  ON jl.account_id  = a.account_id
        LEFT JOIN Parties p     ON jl.party_id    = p.party_id
        WHERE p.party_name = p_party_name
          AND je.entry_date BETWEEN p_start_date AND p_end_date
    ),
    -- Map each journal_id to the user who created the source document
    journal_author AS (
        SELECT pi.journal_id, u.username::TEXT
        FROM purchaseinvoices pi LEFT JOIN auth_user u ON u.id = pi.created_by
        WHERE pi.journal_id IS NOT NULL
        UNION ALL
        SELECT pr.journal_id, u.username::TEXT
        FROM purchasereturns pr LEFT JOIN auth_user u ON u.id = pr.created_by
        WHERE pr.journal_id IS NOT NULL
        UNION ALL
        SELECT si.journal_id, u.username::TEXT
        FROM salesinvoices si LEFT JOIN auth_user u ON u.id = si.created_by
        WHERE si.journal_id IS NOT NULL
        UNION ALL
        SELECT sr.journal_id, u.username::TEXT
        FROM salesreturns sr LEFT JOIN auth_user u ON u.id = sr.created_by
        WHERE sr.journal_id IS NOT NULL
        UNION ALL
        SELECT r.journal_id, u.username::TEXT
        FROM receipts r LEFT JOIN auth_user u ON u.id = r.created_by
        WHERE r.journal_id IS NOT NULL
        UNION ALL
        SELECT py.journal_id, u.username::TEXT
        FROM payments py LEFT JOIN auth_user u ON u.id = py.created_by
        WHERE py.journal_id IS NOT NULL
    )
    SELECT
        pl.entry_date,
        pl.journal_id,
        pl.description,
        pl.party_name,
        pl.account_name                                                 AS account_type,
        pl.debit,
        pl.credit,
        SUM(pl.amount) OVER (ORDER BY pl.entry_date, pl.journal_id
                             ROWS UNBOUNDED PRECEDING)                  AS running_balance,
        COALESCE(ja.username::TEXT, 'N/A')                              AS created_by
    FROM party_ledger pl
    LEFT JOIN journal_author ja ON ja.journal_id = pl.journal_id
    ORDER BY pl.entry_date, pl.journal_id;
END;
$$;
--
-- Name: detailed_ledger2(text, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION detailed_ledger2(p_party_name text, p_start_date date, p_end_date date) RETURNS TABLE(entry_date date, journal_id bigint, description text, party_name text, account_type text, debit numeric, credit numeric, running_balance numeric, invoice_details jsonb, created_by text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_opening_balance NUMERIC;
BEGIN
    -- Opening balance: sum of (debit - credit) before p_start_date
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
    INTO   v_opening_balance
    FROM   journallines jl
    JOIN   journalentries je ON jl.journal_id = je.journal_id
    JOIN   parties p         ON jl.party_id   = p.party_id
    WHERE  p.party_name = p_party_name
      AND  je.entry_date < p_start_date;

    RETURN QUERY
    WITH party_ledger AS (
        SELECT
            je.entry_date                   AS entry_date,
            je.journal_id                   AS journal_id,
            je.description::TEXT            AS description,
            p.party_name::TEXT              AS party_name,
            a.account_name::TEXT            AS account_name,
            jl.debit                        AS debit,
            jl.credit                       AS credit,
            (jl.debit - jl.credit)          AS amount
        FROM journallines jl
        JOIN journalentries je  ON jl.journal_id   = je.journal_id
        JOIN chartofaccounts a  ON jl.account_id   = a.account_id
        LEFT JOIN parties p     ON jl.party_id     = p.party_id
        WHERE p.party_name = p_party_name
          AND je.entry_date BETWEEN p_start_date AND p_end_date
    ),

    journal_source AS (
        SELECT pi.journal_id, 'purchase'::TEXT        AS source_type, pi.purchase_invoice_id  AS source_id FROM purchaseinvoices pi  WHERE pi.journal_id IS NOT NULL
        UNION ALL
        SELECT pr.journal_id, 'purchase_return'::TEXT AS source_type, pr.purchase_return_id   AS source_id FROM purchasereturns pr   WHERE pr.journal_id IS NOT NULL
        UNION ALL
        SELECT si.journal_id, 'sale'::TEXT            AS source_type, si.sales_invoice_id     AS source_id FROM salesinvoices si     WHERE si.journal_id IS NOT NULL
        UNION ALL
        SELECT sr.journal_id, 'sale_return'::TEXT     AS source_type, sr.sales_return_id      AS source_id FROM salesreturns sr      WHERE sr.journal_id IS NOT NULL
        UNION ALL
        SELECT r.journal_id,  'receipt'::TEXT         AS source_type, r.receipt_id            AS source_id FROM receipts r           WHERE r.journal_id  IS NOT NULL
        UNION ALL
        SELECT py.journal_id, 'payment'::TEXT         AS source_type, py.payment_id           AS source_id FROM payments py          WHERE py.journal_id IS NOT NULL
    ),

    -- Resolve username from the source document table
    journal_author AS (
        SELECT pi.journal_id, u.username::TEXT
        FROM purchaseinvoices pi LEFT JOIN auth_user u ON u.id = pi.created_by
        WHERE pi.journal_id IS NOT NULL
        UNION ALL
        SELECT pr.journal_id, u.username::TEXT
        FROM purchasereturns pr LEFT JOIN auth_user u ON u.id = pr.created_by
        WHERE pr.journal_id IS NOT NULL
        UNION ALL
        SELECT si.journal_id, u.username::TEXT
        FROM salesinvoices si LEFT JOIN auth_user u ON u.id = si.created_by
        WHERE si.journal_id IS NOT NULL
        UNION ALL
        SELECT sr.journal_id, u.username::TEXT
        FROM salesreturns sr LEFT JOIN auth_user u ON u.id = sr.created_by
        WHERE sr.journal_id IS NOT NULL
        UNION ALL
        SELECT r.journal_id, u.username::TEXT
        FROM receipts r LEFT JOIN auth_user u ON u.id = r.created_by
        WHERE r.journal_id IS NOT NULL
        UNION ALL
        SELECT py.journal_id, u.username::TEXT
        FROM payments py LEFT JOIN auth_user u ON u.id = py.created_by
        WHERE py.journal_id IS NOT NULL
    )

    SELECT
        pl.entry_date,
        pl.journal_id,
        pl.description,
        pl.party_name,
        pl.account_name                                                 AS account_type,
        pl.debit,
        pl.credit,
        v_opening_balance + SUM(pl.amount) OVER (
            ORDER BY pl.entry_date, pl.journal_id
            ROWS UNBOUNDED PRECEDING
        )                                                               AS running_balance,

        -- invoice_details (unchanged)
        CASE js.source_type
            WHEN 'purchase' THEN (
                SELECT to_jsonb(d) FROM (
                    SELECT 'Purchase Invoice' AS type, pi.purchase_invoice_id, pa.party_name AS vendor, pi.invoice_date, pi.total_amount,
                        (SELECT json_agg(json_build_object('item_name',i.item_name,'qty',pit.quantity,'unit_price',pit.unit_price,'line_total',pit.quantity*pit.unit_price,
                            'serials',(SELECT json_agg(json_build_object('serial',pu.serial_number,'comment',pu.serial_comment)) FROM purchaseunits pu WHERE pu.purchase_item_id=pit.purchase_item_id)))
                         FROM purchaseitems pit JOIN items i ON i.item_id=pit.item_id WHERE pit.purchase_invoice_id=pi.purchase_invoice_id) AS items
                    FROM purchaseinvoices pi JOIN parties pa ON pa.party_id=pi.vendor_id WHERE pi.purchase_invoice_id=js.source_id
                ) d
            )
            WHEN 'purchase_return' THEN (
                SELECT to_jsonb(d) FROM (
                    SELECT 'Purchase Return' AS type, pr.purchase_return_id, pa.party_name AS vendor, pr.return_date, pr.total_amount,
                        (SELECT json_agg(json_build_object('item_name',i.item_name,'unit_price',pri.unit_price,'serial_number',pri.serial_number))
                         FROM purchasereturnitems pri JOIN items i ON i.item_id=pri.item_id WHERE pri.purchase_return_id=pr.purchase_return_id) AS items
                    FROM purchasereturns pr JOIN parties pa ON pa.party_id=pr.vendor_id WHERE pr.purchase_return_id=js.source_id
                ) d
            )
            WHEN 'sale' THEN (
                SELECT to_jsonb(d) FROM (
                    SELECT 'Sale Invoice' AS type, si.sales_invoice_id, pa.party_name AS customer, si.invoice_date, si.total_amount,
                        (SELECT json_agg(json_build_object('item_name',i.item_name,'qty',sitm.quantity,'unit_price',sitm.unit_price,'line_total',sitm.quantity*sitm.unit_price,
                            'serials',(SELECT json_agg(json_build_object('serial',pu.serial_number,'comment',pu.serial_comment,'sold_price',su.sold_price))
                                       FROM soldunits su JOIN purchaseunits pu ON su.unit_id=pu.unit_id WHERE su.sales_item_id=sitm.sales_item_id)))
                         FROM salesitems sitm JOIN items i ON i.item_id=sitm.item_id WHERE sitm.sales_invoice_id=si.sales_invoice_id) AS items
                    FROM salesinvoices si JOIN parties pa ON pa.party_id=si.customer_id WHERE si.sales_invoice_id=js.source_id
                ) d
            )
            WHEN 'sale_return' THEN (
                SELECT to_jsonb(d) FROM (
                    SELECT 'Sale Return' AS type, sr.sales_return_id, pa.party_name AS customer, sr.return_date, sr.total_amount,
                        (SELECT json_agg(json_build_object('item_name',i.item_name,'sold_price',sri.sold_price,'cost_price',sri.cost_price,'serial_number',sri.serial_number))
                         FROM salesreturnitems sri JOIN items i ON i.item_id=sri.item_id WHERE sri.sales_return_id=sr.sales_return_id) AS items
                    FROM salesreturns sr JOIN parties pa ON pa.party_id=sr.customer_id WHERE sr.sales_return_id=js.source_id
                ) d
            )
            WHEN 'receipt' THEN (
                SELECT to_jsonb(d) FROM (
                    SELECT 'Receipt' AS type, r.receipt_id, pa.party_name AS party, r.receipt_date, r.amount, r.method, r.reference_no, r.notes, r.description
                    FROM receipts r JOIN parties pa ON pa.party_id=r.party_id WHERE r.receipt_id=js.source_id
                ) d
            )
            WHEN 'payment' THEN (
                SELECT to_jsonb(d) FROM (
                    SELECT 'Payment' AS type, py.payment_id, pa.party_name AS party, py.payment_date, py.amount, py.method, py.reference_no, py.notes, py.description
                    FROM payments py JOIN parties pa ON pa.party_id=py.party_id WHERE py.payment_id=js.source_id
                ) d
            )
            ELSE NULL
        END                                                             AS invoice_details,

        COALESCE(ja.username::TEXT, 'N/A')                              AS created_by

    FROM party_ledger pl
    LEFT JOIN journal_source js  ON js.journal_id  = pl.journal_id
    LEFT JOIN journal_author ja  ON ja.journal_id  = pl.journal_id
    ORDER BY pl.entry_date, pl.journal_id;

END;
$$;
--
-- Name: fn_dash_expense_kpi(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION fn_dash_expense_kpi() RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_build_object(
        'today',      COALESCE(SUM(amount) FILTER (
                          WHERE entry_date = CURRENT_DATE
                      ), 0),
        'this_month', COALESCE(SUM(amount) FILTER (
                          WHERE DATE_TRUNC('month', entry_date) = DATE_TRUNC('month', CURRENT_DATE)
                      ), 0),
        'this_year',  COALESCE(SUM(amount) FILTER (
                          WHERE DATE_PART('year', entry_date) = DATE_PART('year', CURRENT_DATE)
                      ), 0)
    )
    INTO v_result
    FROM vw_dash_expenses;

    RETURN COALESCE(v_result, '{}'::json);
END;
$$;
--
-- Name: fn_dash_fast_moving_items(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION fn_dash_fast_moving_items(p_days integer DEFAULT 30, p_limit integer DEFAULT 10) RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(
        json_build_object(
            'item_id',    item_id,
            'item_name',  item_name,
            'category',   category,
            'units_sold', units_sold,
            'revenue',    revenue
        )
        ORDER BY units_sold DESC
    )
    INTO v_result
    FROM (
        SELECT
            i.item_id,
            i.item_name,
            COALESCE(i.category, 'N/A')        AS category,
            COUNT(su.sold_unit_id)              AS units_sold,
            COALESCE(SUM(su.sold_price), 0)    AS revenue
        FROM items i
        JOIN salesitems    sitem  ON sitem.item_id       = i.item_id
        JOIN soldunits     su     ON su.sales_item_id    = sitem.sales_item_id
        JOIN salesinvoices si     ON si.sales_invoice_id = sitem.sales_invoice_id
        WHERE si.invoice_date >= CURRENT_DATE - (p_days || ' days')::INTERVAL
        GROUP BY i.item_id, i.item_name, i.category
        ORDER BY COUNT(su.sold_unit_id) DESC
        LIMIT p_limit
    ) ranked;

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;
--
-- Name: fn_dash_low_stock_items(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION fn_dash_low_stock_items(p_threshold integer DEFAULT 5) RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(
        json_build_object(
            'item_id',        item_id,
            'item_name',      item_name,
            'category',       COALESCE(category, 'N/A'),
            'units_in_stock', units_in_stock,
            'sale_price',     sale_price
        )
        ORDER BY units_in_stock ASC
    )
    INTO v_result
    FROM vw_dash_stock_overview
    WHERE units_in_stock < p_threshold;

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;
--
-- Name: fn_dash_receivables_aging(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION fn_dash_receivables_aging() RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_build_object(
        'overdue', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'party_id',    party_id,
                    'party_name',  party_name,
                    'balance',     ar_balance,
                    'last_txn',    TO_CHAR(last_transaction_date, 'YYYY-MM-DD'),
                    'days_overdue',(CURRENT_DATE - last_transaction_date)
                )
                ORDER BY ar_balance DESC
            ), '[]'::json)
            FROM vw_dash_party_ar_balance
            WHERE (CURRENT_DATE - last_transaction_date) > 60
        ),
        'medium_risk', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'party_id',    party_id,
                    'party_name',  party_name,
                    'balance',     ar_balance,
                    'last_txn',    TO_CHAR(last_transaction_date, 'YYYY-MM-DD'),
                    'days_overdue',(CURRENT_DATE - last_transaction_date)
                )
                ORDER BY ar_balance DESC
            ), '[]'::json)
            FROM vw_dash_party_ar_balance
            WHERE (CURRENT_DATE - last_transaction_date) BETWEEN 30 AND 60
        ),
        'fresh', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'party_id',    party_id,
                    'party_name',  party_name,
                    'balance',     ar_balance,
                    'last_txn',    TO_CHAR(last_transaction_date, 'YYYY-MM-DD'),
                    'days_overdue',(CURRENT_DATE - last_transaction_date)
                )
                ORDER BY ar_balance DESC
            ), '[]'::json)
            FROM vw_dash_party_ar_balance
            WHERE (CURRENT_DATE - last_transaction_date) < 30
        ),
        'total_overdue_amount', (
            SELECT COALESCE(SUM(ar_balance), 0)
            FROM vw_dash_party_ar_balance
            WHERE (CURRENT_DATE - last_transaction_date) > 60
        ),
        'total_medium_amount', (
            SELECT COALESCE(SUM(ar_balance), 0)
            FROM vw_dash_party_ar_balance
            WHERE (CURRENT_DATE - last_transaction_date) BETWEEN 30 AND 60
        ),
        'total_fresh_amount', (
            SELECT COALESCE(SUM(ar_balance), 0)
            FROM vw_dash_party_ar_balance
            WHERE (CURRENT_DATE - last_transaction_date) < 30
        )
    )
    INTO v_result;

    RETURN COALESCE(v_result, '{}'::json);
END;
$$;
--
-- Name: fn_dash_recent_transactions(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION fn_dash_recent_transactions(p_limit integer DEFAULT 10) RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_result JSON;
BEGIN
    -- The UNION ALL subquery is wrapped so ORDER BY + LIMIT apply to the whole set
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
$$;
--
-- Name: fn_dash_sales_last7days(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION fn_dash_sales_last7days() RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(
        json_build_object(
            'date',    TO_CHAR(d.day, 'YYYY-MM-DD'),
            'label',   TO_CHAR(d.day, 'Mon DD'),
            'revenue', COALESCE(s.revenue, 0),
            'profit',  COALESCE(s.profit,  0)
        )
        ORDER BY d.day
    )
    INTO v_result
    FROM (
        SELECT gs::date AS day
        FROM generate_series(
            CURRENT_DATE - INTERVAL '6 days',
            CURRENT_DATE,
            '1 day'::interval
        ) gs
    ) d
    LEFT JOIN (
        SELECT
            si.invoice_date                                   AS sale_date,
            SUM(si.total_amount)                              AS revenue,
            COALESCE(SUM(su.sold_price - pi2.unit_price), 0) AS profit
        FROM salesinvoices si
        LEFT JOIN salesitems    sitem  ON sitem.sales_invoice_id  = si.sales_invoice_id
        LEFT JOIN soldunits     su     ON su.sales_item_id        = sitem.sales_item_id
        LEFT JOIN purchaseunits punit  ON punit.unit_id           = su.unit_id
        LEFT JOIN purchaseitems pi2    ON pi2.purchase_item_id    = punit.purchase_item_id
        WHERE si.invoice_date >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY si.invoice_date
    ) s ON s.sale_date = d.day;

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;
--
-- Name: fn_dash_sales_range(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION fn_dash_sales_range(p_from date, p_to date) RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(
        json_build_object(
            'date',    TO_CHAR(agg.invoice_date, 'YYYY-MM-DD'),
            'label',   TO_CHAR(agg.invoice_date, 'Mon DD'),
            'revenue', agg.revenue,
            'profit',  agg.profit
        )
        ORDER BY agg.invoice_date
    )
    INTO v_result
    FROM (
        SELECT
            si.invoice_date,
            SUM(si.total_amount)                              AS revenue,
            COALESCE(SUM(su.sold_price - pi2.unit_price), 0) AS profit
        FROM salesinvoices si
        LEFT JOIN salesitems    sitem  ON sitem.sales_invoice_id  = si.sales_invoice_id
        LEFT JOIN soldunits     su     ON su.sales_item_id        = sitem.sales_item_id
        LEFT JOIN purchaseunits punit  ON punit.unit_id           = su.unit_id
        LEFT JOIN purchaseitems pi2    ON pi2.purchase_item_id    = punit.purchase_item_id
        WHERE si.invoice_date BETWEEN p_from AND p_to
        GROUP BY si.invoice_date
    ) agg;

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;
--
-- Name: fn_dash_sales_today_kpi(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION fn_dash_sales_today_kpi() RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_build_object(
        'sales_today',   COALESCE(inv.total_sales,  0),
        'invoice_count', COALESCE(inv.invoice_count, 0),
        'profit_today',  COALESCE(unit_profit.total_profit, 0)
    )
    INTO v_result
    FROM (
        -- Aggregate at invoice level — no joins that can fan out
        SELECT
            SUM(si.total_amount)            AS total_sales,
            COUNT(DISTINCT si.sales_invoice_id) AS invoice_count
        FROM salesinvoices si
        WHERE si.invoice_date = CURRENT_DATE
    ) inv,
    (
        -- Aggregate profit at unit level — soldunits is the grain here
        SELECT
            SUM(su.sold_price - pi2.unit_price) AS total_profit
        FROM salesinvoices si
        JOIN salesitems    sitem  ON sitem.sales_invoice_id = si.sales_invoice_id
        JOIN soldunits     su     ON su.sales_item_id       = sitem.sales_item_id
        JOIN purchaseunits punit  ON punit.unit_id          = su.unit_id
        JOIN purchaseitems pi2    ON pi2.purchase_item_id   = punit.purchase_item_id
        WHERE si.invoice_date = CURRENT_DATE
          AND su.status = 'Sold'   -- exclude Returned / Damaged units from profit
    ) unit_profit;

    RETURN COALESCE(v_result, '{}'::json);
END;
$$;
--
-- Name: fn_dash_smart_alerts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION fn_dash_smart_alerts() RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    -- rec must be declared explicitly for FOR loops in plpgsql
    rec           RECORD;
    v_alerts      JSON[]  := ARRAY[]::JSON[];
    v_cash        NUMERIC;
    v_sales_today NUMERIC;
    v_result      JSON;
BEGIN

    -- ── Alert 1: Negative Cash ──────────────────────────────────────────
    SELECT COALESCE(balance, 0)
    INTO   v_cash
    FROM   vw_trial_balance
    WHERE  name ILIKE '%cash%'
    LIMIT  1;

    IF v_cash IS NOT NULL AND v_cash < 0 THEN
        v_alerts := v_alerts || ARRAY[json_build_object(
            'type',    'danger',
            'icon',    'fa-triangle-exclamation',
            'title',   'Negative Cash Balance',
            'message', 'Cash balance is PKR ' || v_cash::TEXT || '. Immediate action required.'
        )];
    END IF;

    -- ── Alert 2: No Sales Today ─────────────────────────────────────────
    SELECT COALESCE(SUM(total_amount), 0)
    INTO   v_sales_today
    FROM   salesinvoices
    WHERE  invoice_date = CURRENT_DATE;

    IF v_sales_today = 0 THEN
        v_alerts := v_alerts || ARRAY[json_build_object(
            'type',    'warning',
            'icon',    'fa-store-slash',
            'title',   'No Sales Today',
            'message', 'No sales invoices have been recorded for today yet.'
        )];
    END IF;

    -- ── Alert 3: Stale Receivables (30+ days no activity, outstanding AR) ─
    FOR rec IN
        SELECT party_name, ar_balance, last_transaction_date
        FROM   vw_dash_party_ar_balance
        WHERE  (CURRENT_DATE - last_transaction_date) >= 30
        ORDER  BY ar_balance DESC
        LIMIT  5
    LOOP
        v_alerts := v_alerts || ARRAY[json_build_object(
            'type',    'warning',
            'icon',    'fa-clock-rotate-left',
            'title',   'Stale Receivable: ' || rec.party_name,
            'message', 'Balance PKR ' || rec.ar_balance::TEXT
                       || ' — last activity '
                       || (CURRENT_DATE - rec.last_transaction_date)::TEXT
                       || ' days ago.'
        )];
    END LOOP;

    -- ── Alert 4: Risky Customers (high AR + no receipt in 45 days) ──────
    FOR rec IN
        SELECT v.party_name, v.ar_balance, v.last_transaction_date
        FROM   vw_dash_party_ar_balance v
        WHERE  v.ar_balance > 50000
          AND  NOT EXISTS (
                   SELECT 1
                   FROM   receipts r
                   WHERE  r.party_id     = v.party_id
                     AND  r.receipt_date >= CURRENT_DATE - INTERVAL '45 days'
               )
        ORDER  BY v.ar_balance DESC
        LIMIT  3
    LOOP
        v_alerts := v_alerts || ARRAY[json_build_object(
            'type',    'danger',
            'icon',    'fa-user-slash',
            'title',   'Risky Customer: ' || rec.party_name,
            'message', 'High receivable PKR ' || rec.ar_balance::TEXT
                       || ' with no payment received in the last 45 days.'
        )];
    END LOOP;

    -- ── Flatten array to JSON ────────────────────────────────────────────
    SELECT json_agg(a) INTO v_result FROM UNNEST(v_alerts) a;
    RETURN COALESCE(v_result, '[]'::json);
END;
$$;
--
-- Name: fn_dash_stale_stock(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION fn_dash_stale_stock(p_days integer DEFAULT 30) RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_agg(
        json_build_object(
            'item_id',        item_id,
            'item_name',      item_name,
            'category',       COALESCE(category, 'N/A'),
            'units_in_stock', units_in_stock,
            'last_sold_date', TO_CHAR(last_sold_date, 'YYYY-MM-DD'),
            'days_stale',     CASE
                                  WHEN last_sold_date IS NULL THEN NULL
                                  ELSE (CURRENT_DATE - last_sold_date)
                              END
        )
        ORDER BY last_sold_date ASC NULLS FIRST
    )
    INTO v_result
    FROM vw_dash_stock_overview
    WHERE
        units_in_stock > 0
        AND (
            last_sold_date IS NULL
            OR last_sold_date < CURRENT_DATE - (p_days || ' days')::INTERVAL
        );

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;
--
-- Name: fn_dash_stock_kpi(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION fn_dash_stock_kpi() RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_build_object(
        'total_units',     COALESCE(SUM(units_in_stock), 0),
        'low_stock_count', COUNT(*) FILTER (WHERE units_in_stock > 0 AND units_in_stock < 5),
        'out_of_stock',    COUNT(*) FILTER (WHERE units_in_stock = 0),
        'total_items',     COUNT(*)
    )
    INTO v_result
    FROM vw_dash_stock_overview;

    RETURN COALESCE(v_result, '{}'::json);
END;
$$;
--
-- Name: fn_dash_top_customers(integer, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION fn_dash_top_customers(p_limit integer DEFAULT 5, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date) RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_result JSON;
    v_from   DATE := COALESCE(p_from, '2000-01-01'::date);
    v_to     DATE := COALESCE(p_to,   CURRENT_DATE);
BEGIN
    SELECT json_agg(
        json_build_object(
            'party_id',        party_id,
            'party_name',      party_name,
            'contact',         contact,
            'invoice_count',   invoice_count,
            'total_purchases', total_purchases,
            'last_purchase',   last_purchase
        )
        ORDER BY total_purchases DESC
    )
    INTO v_result
    FROM (
        SELECT
            p.party_id,
            p.party_name,
            COALESCE(p.contact_info, 'N/A')              AS contact,
            COUNT(DISTINCT si.sales_invoice_id)           AS invoice_count,
            COALESCE(SUM(si.total_amount), 0)             AS total_purchases,
            TO_CHAR(MAX(si.invoice_date), 'YYYY-MM-DD')  AS last_purchase
        FROM parties p
        JOIN salesinvoices si ON si.customer_id = p.party_id
        WHERE si.invoice_date BETWEEN v_from AND v_to
        GROUP BY p.party_id, p.party_name, p.contact_info
        ORDER BY SUM(si.total_amount) DESC
        LIMIT p_limit
    ) subq;

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;
--
-- Name: fn_dash_top_expense_categories(integer, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION fn_dash_top_expense_categories(p_limit integer DEFAULT 5, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date) RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_result JSON;
    v_from   DATE := COALESCE(p_from, DATE_TRUNC('month', CURRENT_DATE)::DATE);
    v_to     DATE := COALESCE(p_to,   CURRENT_DATE);
BEGIN
    SELECT json_agg(
        json_build_object(
            'category', expense_category,
            'total',    cat_total,
            'count',    cat_count
        )
        ORDER BY cat_total DESC
    )
    INTO v_result
    FROM (
        SELECT
            expense_category,
            COALESCE(SUM(amount), 0) AS cat_total,
            COUNT(*)                  AS cat_count
        FROM vw_dash_expenses
        WHERE entry_date BETWEEN v_from AND v_to
        GROUP BY expense_category
        ORDER BY SUM(amount) DESC
        LIMIT p_limit
    ) cats;

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;
--
-- Name: fn_dash_top_expense_descriptions(integer, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION fn_dash_top_expense_descriptions(p_limit integer DEFAULT 5, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date) RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_result JSON;
    v_from   DATE := COALESCE(p_from, DATE_TRUNC('month', CURRENT_DATE)::DATE);
    v_to     DATE := COALESCE(p_to,   CURRENT_DATE);
BEGIN
    SELECT json_agg(
        json_build_object(
            'description', description,
            'category',    expense_category,
            'total',       desc_total,
            'count',       desc_count
        )
        ORDER BY desc_total DESC
    )
    INTO v_result
    FROM (
        SELECT
            COALESCE(NULLIF(TRIM(expense_note), ''), 'No Description') AS description,
            expense_category,
            COALESCE(SUM(amount), 0) AS desc_total,
            COUNT(*)                  AS desc_count
        FROM vw_dash_expenses
        WHERE entry_date BETWEEN v_from AND v_to
          AND expense_note IS NOT NULL
          AND TRIM(expense_note) <> ''
        GROUP BY expense_note, expense_category
        ORDER BY SUM(amount) DESC
        LIMIT p_limit
    ) descs;

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;
--
-- Name: fn_dash_top_vendors(integer, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION fn_dash_top_vendors(p_limit integer DEFAULT 5, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date) RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
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
        GROUP BY p.party_id, p.party_name, p.contact_info
        ORDER BY SUM(pi.total_amount) DESC
        LIMIT p_limit
    ) subq;

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;
--
-- Name: get_accounts_payable_json_excluding(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_accounts_payable_json_excluding(p_exclude_names text[] DEFAULT ARRAY[]::text[]) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(
               jsonb_build_object(
                   'name', name,
                   'balance', ABS(balance)   -- Return as positive absolute value for clarity
               )
           )
    INTO result
    FROM vw_trial_balance
    WHERE code IS NULL
      AND type NOT ILIKE '%Expense%'
      AND balance < 0   -- Negative = we owe them (Accounts Payable)
      AND (
          p_exclude_names IS NULL
          OR array_length(p_exclude_names, 1) IS NULL
          OR NOT (name = ANY(p_exclude_names))
      );

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
--
-- Name: get_accounts_receivable_json_excluding(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_accounts_receivable_json_excluding(p_exclude_names text[] DEFAULT ARRAY[]::text[]) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(
               jsonb_build_object(
                   'name', name,
                   'balance', balance
               )
           )
    INTO result
    FROM vw_trial_balance
    WHERE code IS NULL
      AND type NOT ILIKE '%Expense%'
      AND balance > 0   -- Positive = customer owes us (Accounts Receivable)
      AND (
          p_exclude_names IS NULL
          OR array_length(p_exclude_names, 1) IS NULL
          OR NOT (name = ANY(p_exclude_names))
      );

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
--
-- Name: get_cash_ledger_with_party(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_cash_ledger_with_party(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS TABLE(entry_date date, journal_id bigint, party_name character varying, description text, debit numeric, credit numeric, balance numeric, created_by text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_cash_account_id BIGINT;
    v_opening_balance NUMERIC(14,4) := 0;
BEGIN
    SELECT account_id INTO v_cash_account_id
    FROM ChartOfAccounts WHERE account_name = 'Cash' LIMIT 1;

    IF v_cash_account_id IS NULL THEN
        RAISE EXCEPTION 'Cash account not found in Chart of Accounts';
    END IF;

    p_start_date := COALESCE(p_start_date, '1900-01-01'::DATE);
    p_end_date   := COALESCE(p_end_date, CURRENT_DATE);

    -- Opening balance
    SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)
    INTO v_opening_balance
    FROM JournalLines jl
    JOIN JournalEntries je ON jl.journal_id = je.journal_id
    WHERE jl.account_id = v_cash_account_id
      AND je.entry_date < p_start_date;

    -- Opening balance row (no author)
    IF v_opening_balance <> 0 THEN
        RETURN QUERY
        SELECT
            p_start_date                                                AS entry_date,
            NULL::BIGINT                                                AS journal_id,
            NULL::VARCHAR(150)                                          AS party_name,
            'Opening Balance'::TEXT                                     AS description,
            CASE WHEN v_opening_balance > 0 THEN v_opening_balance ELSE 0 END AS debit,
            CASE WHEN v_opening_balance < 0 THEN ABS(v_opening_balance) ELSE 0 END AS credit,
            v_opening_balance                                           AS balance,
            NULL::TEXT                                                  AS created_by;
    END IF;

    -- Main cash transactions with running balance and author
    RETURN QUERY
    WITH cash_transactions AS (
        SELECT
            je.entry_date,
            je.journal_id,
            (SELECT p.party_name
             FROM JournalLines jl2
             LEFT JOIN Parties p ON jl2.party_id = p.party_id
             WHERE jl2.journal_id = je.journal_id
               AND jl2.account_id != v_cash_account_id
               AND jl2.party_id IS NOT NULL
             LIMIT 1)                                                   AS party_name,
            je.description,
            jl.debit,
            jl.credit,
            (jl.debit - jl.credit)                                      AS net_amount
        FROM JournalLines jl
        JOIN JournalEntries je ON jl.journal_id = je.journal_id
        WHERE jl.account_id = v_cash_account_id
          AND je.entry_date >= p_start_date
          AND je.entry_date <= p_end_date
        ORDER BY je.entry_date, je.journal_id
    ),
    -- Resolve author username from whichever document owns this journal
    journal_author AS (
        SELECT py.journal_id, u.username::TEXT
        FROM payments py LEFT JOIN auth_user u ON u.id = py.created_by
        WHERE py.journal_id IS NOT NULL
        UNION ALL
        SELECT r.journal_id, u.username::TEXT
        FROM receipts r LEFT JOIN auth_user u ON u.id = r.created_by
        WHERE r.journal_id IS NOT NULL
        UNION ALL
        SELECT si.journal_id, u.username::TEXT
        FROM salesinvoices si LEFT JOIN auth_user u ON u.id = si.created_by
        WHERE si.journal_id IS NOT NULL
        UNION ALL
        SELECT pi.journal_id, u.username::TEXT
        FROM purchaseinvoices pi LEFT JOIN auth_user u ON u.id = pi.created_by
        WHERE pi.journal_id IS NOT NULL
        UNION ALL
        SELECT sr.journal_id, u.username::TEXT
        FROM salesreturns sr LEFT JOIN auth_user u ON u.id = sr.created_by
        WHERE sr.journal_id IS NOT NULL
        UNION ALL
        SELECT pr.journal_id, u.username::TEXT
        FROM purchasereturns pr LEFT JOIN auth_user u ON u.id = pr.created_by
        WHERE pr.journal_id IS NOT NULL
    )
    SELECT
        ct.entry_date,
        ct.journal_id,
        ct.party_name,
        ct.description,
        ct.debit,
        ct.credit,
        v_opening_balance + SUM(ct.net_amount) OVER (
            ORDER BY ct.entry_date, ct.journal_id
        )                                                               AS balance,
        COALESCE(ja.username::TEXT, 'N/A')                              AS created_by
    FROM cash_transactions ct
    LEFT JOIN journal_author ja ON ja.journal_id = ct.journal_id;

END;
$$;
--
-- Name: get_current_purchase(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_current_purchase(p_invoice_id bigint) RETURNS json
    LANGUAGE plpgsql
    AS $$
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
    WHERE pi.purchase_invoice_id = p_invoice_id;
    RETURN result;
END;
$$;
--
-- Name: get_current_purchase_return(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_current_purchase_return(p_return_id bigint) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE result JSON;
BEGIN
    SELECT json_build_object(
        'purchase_return_id', pr.purchase_return_id,
        'Vendor',             pa.party_name,
        'return_date',        pr.return_date,
        'total_amount',       pr.total_amount,
        'description',        je.description,
        'created_by',         COALESCE(u.username, 'N/A'),
        'items', (
            SELECT json_agg(json_build_object(
                'item_name',     i.item_name,
                'unit_price',    pri.unit_price,
                'serial_number', pri.serial_number
            ))
            FROM PurchaseReturnItems pri
            JOIN Items i ON i.item_id = pri.item_id
            WHERE pri.purchase_return_id = pr.purchase_return_id
        )
    ) INTO result
    FROM PurchaseReturns pr
    JOIN Parties pa ON pa.party_id = pr.vendor_id
    LEFT JOIN JournalEntries je ON je.journal_id = pr.journal_id
    LEFT JOIN auth_user u ON u.id = pr.created_by
    WHERE pr.purchase_return_id = p_return_id;
    RETURN result;
END;
$$;
--
-- Name: get_current_sale(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_current_sale(p_invoice_id bigint) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE result JSON;
BEGIN
    SELECT json_build_object(
        'sales_invoice_id', si.sales_invoice_id,
        'Party',            p.party_name,
        'invoice_date',     si.invoice_date,
        'total_amount',     si.total_amount,
        'description',      je.description,
        'created_by',       COALESCE(u.username, 'N/A'),
        'items', (
            SELECT json_agg(json_build_object(
                'item_name',  i.item_name,
                'qty',        s_items.quantity,
                'unit_price', s_items.unit_price,
                'serials', (
                    SELECT json_agg(pu.serial_number)
                    FROM SoldUnits su
                    JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
                    WHERE su.sales_item_id = s_items.sales_item_id
                )
            ))
            FROM SalesItems s_items
            JOIN Items i ON i.item_id = s_items.item_id
            WHERE s_items.sales_invoice_id = si.sales_invoice_id
        )
    ) INTO result
    FROM SalesInvoices si
    JOIN Parties p ON p.party_id = si.customer_id
    LEFT JOIN JournalEntries je ON je.journal_id = si.journal_id
    LEFT JOIN auth_user u ON u.id = si.created_by
    WHERE si.sales_invoice_id = p_invoice_id;
    RETURN result;
END;
$$;
--
-- Name: get_current_sales_return(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_current_sales_return(p_return_id bigint) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE result JSON;
BEGIN
    SELECT json_build_object(
        'sales_return_id', sr.sales_return_id,
        'Customer',        pa.party_name,
        'return_date',     sr.return_date,
        'total_amount',    sr.total_amount,
        'description',     je.description,
        'created_by',      COALESCE(u.username, 'N/A'),
        'items', (
            SELECT json_agg(json_build_object(
                'item_name',     i.item_name,
                'sold_price',    sri.sold_price,
                'cost_price',    sri.cost_price,
                'serial_number', sri.serial_number
            ))
            FROM SalesReturnItems sri
            JOIN Items i ON i.item_id = sri.item_id
            WHERE sri.sales_return_id = sr.sales_return_id
        )
    ) INTO result
    FROM SalesReturns sr
    JOIN Parties pa ON pa.party_id = sr.customer_id
    LEFT JOIN JournalEntries je ON je.journal_id = sr.journal_id
    LEFT JOIN auth_user u ON u.id = sr.created_by
    WHERE sr.sales_return_id = p_return_id;
    RETURN result;
END;
$$;
--
-- Name: get_expense_party_balances_json(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_expense_party_balances_json() RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(
               jsonb_build_object(
                   'name', name,
                   'balance', balance
               )
           )
    INTO result
    FROM vw_trial_balance
    WHERE code IS NULL  -- only parties (not chart of accounts)
      AND type = 'Expense Party'  -- specifically Expense Party
      AND balance <> 0;  -- optional: skip zero balances

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
--
-- Name: get_item_by_name(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_item_by_name(p_item_name text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result JSONB;
BEGIN
    SELECT COALESCE(
        jsonb_agg(
            (to_jsonb(i) - 'updated_at' - 'created_at')
            || jsonb_build_object('created_by_username', COALESCE(u.username, 'N/A'))
        ),
        '[]'::jsonb
    )
    INTO result
    FROM Items i
    LEFT JOIN auth_user u ON u.id = i.created_by
    WHERE i.item_name ILIKE p_item_name;
    RETURN result;
END;
$$;
--
-- Name: get_item_names_like(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_item_names_like(search_term text) RETURNS TABLE(item_name text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT item_name
    FROM items
    WHERE UPPER(item_name) LIKE search_term || '%';
END;
$$;
--
-- Name: get_item_stock_by_name(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_item_stock_by_name(p_item_name character varying) RETURNS TABLE(item_id_out text, item_name_out character varying, serial_number_out character varying, serial_comment_out text, quantity_out text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    WITH stock AS (
        SELECT 
            i.item_id,
            i.item_name,
            pu.serial_number,
            pu.serial_comment,
            COUNT(*) OVER () AS total_quantity,
            ROW_NUMBER() OVER (ORDER BY pu.serial_number) AS rn
        FROM purchaseunits pu
        JOIN purchaseitems pit ON pu.purchase_item_id = pit.purchase_item_id
        JOIN items i ON pit.item_id = i.item_id
        WHERE i.item_name = p_item_name
          AND pu.in_stock = true
          AND NOT EXISTS (
              SELECT 1 FROM soldunits su
              WHERE su.unit_id = pu.unit_id AND su.status = 'Sold'
          )
          AND NOT EXISTS (
              SELECT 1 FROM purchasereturnitems pri
              WHERE pri.serial_number = pu.serial_number
          )
    )
    SELECT 
        CASE WHEN rn = 1 THEN item_id::TEXT ELSE '' END,
        CASE WHEN rn = 1 THEN item_name ELSE ''::VARCHAR END,
        serial_number,
        serial_comment,
        CASE WHEN rn = 1 THEN total_quantity::TEXT ELSE '' END
    FROM stock
    ORDER BY rn;
END;
$$;
--
-- Name: get_items_json(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_items_json() RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(
               jsonb_build_object(
                   'item_name', item_name,
                   'brand', brand
               )
           )
    INTO result
    FROM Items;

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
--
-- Name: get_last_20_payments_json(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_last_20_payments_json(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_party TEXT;
    result  JSONB;
BEGIN
    -- Extract optional party filter
    v_party := p_data->>'party_name';

    SELECT jsonb_agg(row_data)
    INTO result
    FROM (
        SELECT to_jsonb(p) || jsonb_build_object('party_name', pt.party_name) AS row_data
        FROM Payments p
        JOIN Parties pt ON pt.party_id = p.party_id
        WHERE (v_party IS NULL OR pt.party_name ILIKE v_party)
        ORDER BY p.payment_date DESC, p.payment_id DESC
        LIMIT 20
    ) sub;

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
--
-- Name: get_last_20_receipts_json(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_last_20_receipts_json(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_party TEXT;
    result  JSONB;
BEGIN
    v_party := p_data->>'party_name';

    SELECT jsonb_agg(row_data)
    INTO result
    FROM (
        SELECT to_jsonb(r) || jsonb_build_object('party_name', pt.party_name) AS row_data
        FROM Receipts r
        JOIN Parties pt ON pt.party_id = r.party_id
        WHERE (v_party IS NULL OR pt.party_name ILIKE v_party)
        ORDER BY r.receipt_date DESC, r.receipt_id DESC
        LIMIT 20
    ) sub;

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
--
-- Name: get_last_payment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_last_payment() RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result JSONB;
BEGIN
    SELECT to_jsonb(p)
        || jsonb_build_object('party_name', pt.party_name)
        || jsonb_build_object('created_by', COALESCE(u.username, 'N/A'))
    INTO result
    FROM Payments p
    LEFT JOIN Parties pt ON pt.party_id = p.party_id
    LEFT JOIN auth_user u ON u.id = p.created_by
    ORDER BY p.payment_id DESC LIMIT 1;
    RETURN result;
END;
$$;
--
-- Name: get_last_purchase(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_last_purchase() RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    last_id BIGINT;
BEGIN
    SELECT purchase_invoice_id INTO last_id
    FROM PurchaseInvoices
    ORDER BY purchase_invoice_id DESC
    LIMIT 1;

    RETURN get_current_purchase(last_id);
END;
$$;
--
-- Name: get_last_purchase_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_last_purchase_id() RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    last_id BIGINT;
BEGIN
    SELECT purchase_invoice_id
    INTO last_id
    FROM PurchaseInvoices
    ORDER BY purchase_invoice_id DESC
    LIMIT 1;

    RETURN last_id;
END;
$$;
--
-- Name: get_last_purchase_return(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_last_purchase_return() RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    last_id BIGINT;
BEGIN
    SELECT purchase_return_id INTO last_id
    FROM PurchaseReturns
    ORDER BY purchase_return_id DESC
    LIMIT 1;

    RETURN get_current_purchase_return(last_id);
END;
$$;
--
-- Name: get_last_purchase_return_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_last_purchase_return_id() RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    last_id BIGINT;
BEGIN
    SELECT purchase_return_id
    INTO last_id
    FROM PurchaseReturns
    ORDER BY purchase_return_id DESC
    LIMIT 1;

    RETURN last_id;
END;
$$;
--
-- Name: get_last_receipt(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_last_receipt() RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result JSONB;
BEGIN
    SELECT to_jsonb(r)
        || jsonb_build_object('party_name', pt.party_name)
        || jsonb_build_object('created_by', COALESCE(u.username, 'N/A'))
    INTO result
    FROM Receipts r
    LEFT JOIN Parties pt ON pt.party_id = r.party_id
    LEFT JOIN auth_user u ON u.id = r.created_by
    ORDER BY r.receipt_id DESC LIMIT 1;
    RETURN result;
END;
$$;
--
-- Name: get_last_sale(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_last_sale() RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    last_id BIGINT;
BEGIN
    SELECT sales_invoice_id INTO last_id
    FROM SalesInvoices
    ORDER BY sales_invoice_id DESC
    LIMIT 1;

    RETURN get_current_sale(last_id);
END;
$$;
--
-- Name: get_last_sale_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_last_sale_id() RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    last_id BIGINT;
BEGIN
    SELECT sales_invoice_id
    INTO last_id
    FROM SalesInvoices
    ORDER BY sales_invoice_id DESC
    LIMIT 1;

    RETURN last_id;
END;
$$;
--
-- Name: get_last_sales_return(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_last_sales_return() RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    last_id BIGINT;
BEGIN
    SELECT sales_return_id INTO last_id
    FROM SalesReturns
    ORDER BY sales_return_id DESC
    LIMIT 1;

    RETURN get_current_sales_return(last_id);
END;
$$;
--
-- Name: get_last_sales_return_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_last_sales_return_id() RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    last_id BIGINT;
BEGIN
    SELECT sales_return_id
    INTO last_id
    FROM SalesReturns
    ORDER BY sales_return_id DESC
    LIMIT 1;

    RETURN last_id;
END;
$$;
--
-- Name: get_next_payment(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_next_payment(p_payment_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result JSONB;
BEGIN
    SELECT to_jsonb(p)
        || jsonb_build_object('party_name', pt.party_name)
        || jsonb_build_object('created_by', COALESCE(u.username, 'N/A'))
    INTO result
    FROM Payments p
    LEFT JOIN Parties pt ON pt.party_id = p.party_id
    LEFT JOIN auth_user u ON u.id = p.created_by
    WHERE p.payment_id > p_payment_id
    ORDER BY p.payment_id ASC LIMIT 1;
    RETURN result;
END;
$$;
--
-- Name: get_next_purchase(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_next_purchase(p_invoice_id bigint) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    next_id BIGINT;
BEGIN
    SELECT purchase_invoice_id INTO next_id
    FROM PurchaseInvoices
    WHERE purchase_invoice_id > p_invoice_id
    ORDER BY purchase_invoice_id ASC
    LIMIT 1;

    IF next_id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN get_current_purchase(next_id);
END;
$$;
--
-- Name: get_next_purchase_return(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_next_purchase_return(p_return_id bigint) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    next_id BIGINT;
BEGIN
    SELECT purchase_return_id INTO next_id
    FROM PurchaseReturns
    WHERE purchase_return_id > p_return_id
    ORDER BY purchase_return_id ASC
    LIMIT 1;

    IF next_id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN get_current_purchase_return(next_id);
END;
$$;
--
-- Name: get_next_receipt(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_next_receipt(p_receipt_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result JSONB;
BEGIN
    SELECT to_jsonb(r)
        || jsonb_build_object('party_name', pt.party_name)
        || jsonb_build_object('created_by', COALESCE(u.username, 'N/A'))
    INTO result
    FROM Receipts r
    LEFT JOIN Parties pt ON pt.party_id = r.party_id
    LEFT JOIN auth_user u ON u.id = r.created_by
    WHERE r.receipt_id > p_receipt_id
    ORDER BY r.receipt_id ASC LIMIT 1;
    RETURN result;
END;
$$;
--
-- Name: get_next_sale(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_next_sale(p_invoice_id bigint) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    next_id BIGINT;
BEGIN
    SELECT sales_invoice_id INTO next_id
    FROM SalesInvoices
    WHERE sales_invoice_id > p_invoice_id
    ORDER BY sales_invoice_id ASC
    LIMIT 1;

    IF next_id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN get_current_sale(next_id);
END;
$$;
--
-- Name: get_next_sales_return(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_next_sales_return(p_return_id bigint) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    next_id BIGINT;
BEGIN
    SELECT sales_return_id INTO next_id
    FROM SalesReturns
    WHERE sales_return_id > p_return_id
    ORDER BY sales_return_id ASC
    LIMIT 1;

    IF next_id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN get_current_sales_return(next_id);
END;
$$;
--
-- Name: get_parties_json(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_parties_json() RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(
               jsonb_build_object(
                   'party_name', party_name,
                   'party_type', party_type
               )
           )
    INTO result
    FROM Parties;

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
--
-- Name: get_party_balance_by_name(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_party_balance_by_name(p_name text) RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_build_object(
        'found',      TRUE,
        'party_name', p.party_name,
        'party_type', p.party_type,
        'balance',    COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)
    )
    INTO v_result
    FROM parties p
    LEFT JOIN journallines jl ON jl.party_id = p.party_id
    WHERE p.party_name ILIKE p_name
    GROUP BY p.party_name, p.party_type
    LIMIT 1;

    -- Party not found
    IF v_result IS NULL THEN
        RETURN json_build_object(
            'found',      FALSE,
            'party_name', p_name
        );
    END IF;

    RETURN v_result;
END;
$$;
--
-- Name: get_party_balances_json(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_party_balances_json() RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(
               jsonb_build_object(
                   'name', name,
                   'balance', balance
               )
           )
    INTO result
    FROM vw_trial_balance
    WHERE code IS NULL  -- only parties (not chart of accounts)
      AND type NOT ILIKE '%Expense%'  -- exclude expense parties if any
      AND balance <> 0;  -- optional: skip zero balances

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
--
-- Name: get_party_balances_json_excluding(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_party_balances_json_excluding(p_exclude_names text[] DEFAULT ARRAY[]::text[]) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(
               jsonb_build_object(
                   'name', name,
                   'balance', balance
               )
           )
    INTO result
    FROM vw_trial_balance
    WHERE code IS NULL
      AND type NOT ILIKE '%Expense%'
      AND balance <> 0
      AND (
          p_exclude_names IS NULL
          OR array_length(p_exclude_names, 1) IS NULL
          OR NOT (name = ANY(p_exclude_names))
      );

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
--
-- Name: get_party_by_name(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_party_by_name(p_name text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result JSONB;
BEGIN
    SELECT COALESCE(
        jsonb_agg(
            to_jsonb(p)
            || jsonb_build_object('created_by_username', COALESCE(u.username, 'N/A'))
        ),
        '[]'::jsonb
    )
    INTO result
    FROM Parties p
    LEFT JOIN auth_user u ON u.id = p.created_by
    WHERE p.party_name ILIKE p_name;
    RETURN result;
END;
$$;
--
-- Name: get_payment_details(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_payment_details(p_payment_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result JSONB;
BEGIN
    SELECT to_jsonb(p)
        || jsonb_build_object('party_name', pt.party_name)
        || jsonb_build_object('created_by', COALESCE(u.username, 'N/A'))
    INTO result
    FROM Payments p
    LEFT JOIN Parties pt ON pt.party_id = p.party_id
    LEFT JOIN auth_user u ON u.id = p.created_by
    WHERE p.payment_id = p_payment_id;
    RETURN result;
END;
$$;
--
-- Name: get_payments_by_date_json(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_payments_by_date_json(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_start DATE;
    v_end   DATE;
    v_party TEXT;
    result  JSONB;
BEGIN
    -- Extract from JSON
    v_start := (p_data->>'start_date')::DATE;
    v_end   := (p_data->>'end_date')::DATE;
    v_party := p_data->>'party_name';

    IF v_start IS NULL OR v_end IS NULL THEN
        RAISE EXCEPTION 'Both start_date and end_date must be provided in JSON';
    END IF;

    SELECT jsonb_agg(to_jsonb(p) || jsonb_build_object('party_name', pt.party_name) 
                     ORDER BY p.payment_date DESC, p.payment_id DESC)
    INTO result
    FROM Payments p
    JOIN Parties pt ON pt.party_id = p.party_id
    WHERE p.payment_date BETWEEN v_start AND v_end
      AND (v_party IS NULL OR pt.party_name ILIKE v_party);

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
--
-- Name: get_previous_payment(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_previous_payment(p_payment_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result JSONB;
BEGIN
    SELECT to_jsonb(p)
        || jsonb_build_object('party_name', pt.party_name)
        || jsonb_build_object('created_by', COALESCE(u.username, 'N/A'))
    INTO result
    FROM Payments p
    LEFT JOIN Parties pt ON pt.party_id = p.party_id
    LEFT JOIN auth_user u ON u.id = p.created_by
    WHERE p.payment_id < p_payment_id
    ORDER BY p.payment_id DESC LIMIT 1;
    RETURN result;
END;
$$;
--
-- Name: get_previous_purchase(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_previous_purchase(p_invoice_id bigint) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    prev_id BIGINT;
BEGIN
    SELECT purchase_invoice_id INTO prev_id
    FROM PurchaseInvoices
    WHERE purchase_invoice_id < p_invoice_id
    ORDER BY purchase_invoice_id DESC
    LIMIT 1;

    IF prev_id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN get_current_purchase(prev_id);
END;
$$;
--
-- Name: get_previous_purchase_return(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_previous_purchase_return(p_return_id bigint) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    prev_id BIGINT;
BEGIN
    SELECT purchase_return_id INTO prev_id
    FROM PurchaseReturns
    WHERE purchase_return_id < p_return_id
    ORDER BY purchase_return_id DESC
    LIMIT 1;

    IF prev_id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN get_current_purchase_return(prev_id);
END;
$$;
--
-- Name: get_previous_receipt(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_previous_receipt(p_receipt_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result JSONB;
BEGIN
    SELECT to_jsonb(r)
        || jsonb_build_object('party_name', pt.party_name)
        || jsonb_build_object('created_by', COALESCE(u.username, 'N/A'))
    INTO result
    FROM Receipts r
    LEFT JOIN Parties pt ON pt.party_id = r.party_id
    LEFT JOIN auth_user u ON u.id = r.created_by
    WHERE r.receipt_id < p_receipt_id
    ORDER BY r.receipt_id DESC LIMIT 1;
    RETURN result;
END;
$$;
--
-- Name: get_previous_sale(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_previous_sale(p_invoice_id bigint) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    prev_id BIGINT;
BEGIN
    SELECT sales_invoice_id INTO prev_id
    FROM SalesInvoices
    WHERE sales_invoice_id < p_invoice_id
    ORDER BY sales_invoice_id DESC
    LIMIT 1;

    IF prev_id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN get_current_sale(prev_id);
END;
$$;
--
-- Name: get_previous_sales_return(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_previous_sales_return(p_return_id bigint) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    prev_id BIGINT;
BEGIN
    SELECT sales_return_id INTO prev_id
    FROM SalesReturns
    WHERE sales_return_id < p_return_id
    ORDER BY sales_return_id DESC
    LIMIT 1;

    IF prev_id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN get_current_sales_return(prev_id);
END;
$$;
--
-- Name: get_purchase_return_summary(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_purchase_return_summary(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    result JSON;
BEGIN
    IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
        -- 🧾 Case 1: Returns between given dates (latest first)
        SELECT json_agg(p ORDER BY p.return_date DESC)
        INTO result
        FROM (
            SELECT
                pr.purchase_return_id,
                pr.return_date,
                pa.party_name AS vendor,
                pr.total_amount
            FROM PurchaseReturns pr
            JOIN Parties pa ON pr.vendor_id = pa.party_id
            WHERE pr.return_date BETWEEN p_start_date AND p_end_date
            ORDER BY pr.return_date DESC
        ) AS p;

    ELSE
        -- 🧾 Case 2: Last 20 purchase returns (latest first)
        SELECT json_agg(p ORDER BY p.return_date DESC)
        INTO result
        FROM (
            SELECT
                pr.purchase_return_id,
                pr.return_date,
                pa.party_name AS vendor,
                pr.total_amount
            FROM PurchaseReturns pr
            JOIN Parties pa ON pr.vendor_id = pa.party_id
            ORDER BY pr.return_date DESC
            LIMIT 20
        ) AS p;
    END IF;

    RETURN COALESCE(result, '[]'::json);
END;
$$;
--
-- Name: get_purchase_summary(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_purchase_summary(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    result JSON;
BEGIN
    IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
        -- 🧾 Case 1: Purchases between given dates (latest first)
        SELECT json_agg(p ORDER BY p.invoice_date DESC)
        INTO result
        FROM (
            SELECT
                pi.purchase_invoice_id,
                pi.invoice_date,
                pa.party_name AS vendor,
                pi.total_amount
            FROM PurchaseInvoices pi
            JOIN Parties pa ON pi.vendor_id = pa.party_id
            WHERE pi.invoice_date BETWEEN p_start_date AND p_end_date
            ORDER BY pi.invoice_date DESC
        ) AS p;

    ELSE
        -- 🧾 Case 2: Last 20 purchases (latest first)
        SELECT json_agg(p ORDER BY p.invoice_date DESC)
        INTO result
        FROM (
            SELECT
                pi.purchase_invoice_id,
                pi.invoice_date,
                pa.party_name AS vendor,
                pi.total_amount
            FROM PurchaseInvoices pi
            JOIN Parties pa ON pi.vendor_id = pa.party_id
            ORDER BY pi.invoice_date DESC
            LIMIT 20
        ) AS p;
    END IF;

    RETURN COALESCE(result, '[]'::json);
END;
$$;
--
-- Name: get_receipt_details(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_receipt_details(p_receipt_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE result JSONB;
BEGIN
    SELECT to_jsonb(r)
        || jsonb_build_object('party_name', pt.party_name)
        || jsonb_build_object('created_by', COALESCE(u.username, 'N/A'))
    INTO result
    FROM Receipts r
    LEFT JOIN Parties pt ON pt.party_id = r.party_id
    LEFT JOIN auth_user u ON u.id = r.created_by
    WHERE r.receipt_id = p_receipt_id;
    RETURN result;
END;
$$;
--
-- Name: get_receipts_by_date_json(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_receipts_by_date_json(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_start DATE;
    v_end   DATE;
    v_party TEXT;
    result  JSONB;
BEGIN
    v_start := (p_data->>'start_date')::DATE;
    v_end   := (p_data->>'end_date')::DATE;
    v_party := p_data->>'party_name';

    IF v_start IS NULL OR v_end IS NULL THEN
        RAISE EXCEPTION 'Both start_date and end_date must be provided in JSON';
    END IF;

    SELECT jsonb_agg(to_jsonb(r) || jsonb_build_object('party_name', pt.party_name) 
                     ORDER BY r.receipt_date DESC, r.receipt_id DESC)
    INTO result
    FROM Receipts r
    JOIN Parties pt ON pt.party_id = r.party_id
    WHERE r.receipt_date BETWEEN v_start AND v_end
      AND (v_party IS NULL OR pt.party_name ILIKE v_party);

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
--
-- Name: get_sales_return_summary(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_sales_return_summary(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    result JSON;
BEGIN
    IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
        -- 📅 Filter by date range
        SELECT json_agg(p ORDER BY p.return_date DESC)
        INTO result
        FROM (
            SELECT
                sr.sales_return_id,
                sr.return_date,
                pa.party_name AS customer,
                sr.total_amount
            FROM SalesReturns sr
            JOIN Parties pa ON sr.customer_id = pa.party_id
            WHERE sr.return_date BETWEEN p_start_date AND p_end_date
            ORDER BY sr.return_date DESC
        ) AS p;
    ELSE
        -- 📅 Last 20 returns
        SELECT json_agg(p ORDER BY p.return_date DESC)
        INTO result
        FROM (
            SELECT
                sr.sales_return_id,
                sr.return_date,
                pa.party_name AS customer,
                sr.total_amount
            FROM SalesReturns sr
            JOIN Parties pa ON sr.customer_id = pa.party_id
            ORDER BY sr.return_date DESC
            LIMIT 20
        ) AS p;
    END IF;

    RETURN COALESCE(result, '[]'::json);
END;
$$;
--
-- Name: get_sales_summary(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_sales_summary(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
    result JSON;
BEGIN
    IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
        -- 🧾 Case 1: Sales between given dates (latest first)
        SELECT json_agg(p ORDER BY p.invoice_date DESC)
        INTO result
        FROM (
            SELECT
                si.sales_invoice_id,
                si.invoice_date,
                pa.party_name AS customer,
                si.total_amount
            FROM SalesInvoices si
            JOIN Parties pa ON si.customer_id = pa.party_id
            WHERE si.invoice_date BETWEEN p_start_date AND p_end_date
            ORDER BY si.invoice_date DESC
        ) AS p;

    ELSE
        -- 🧾 Case 2: Last 20 sales (latest first)
        SELECT json_agg(p ORDER BY p.invoice_date DESC)
        INTO result
        FROM (
            SELECT
                si.sales_invoice_id,
                si.invoice_date,
                pa.party_name AS customer,
                si.total_amount
            FROM SalesInvoices si
            JOIN Parties pa ON si.customer_id = pa.party_id
            ORDER BY si.invoice_date DESC
            LIMIT 20
        ) AS p;
    END IF;

    RETURN COALESCE(result, '[]'::json);
END;
$$;
--
-- Name: get_serial_ledger(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_serial_ledger(p_serial text) RETURNS TABLE(serial_number text, serial_comment text, item_name text, txn_date date, particulars text, reference text, qty_in integer, qty_out integer, balance integer, party_name text, purchase_price numeric, sale_price numeric, profit numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY

    WITH item_info AS (
        SELECT 
            pu.serial_number::text AS serial_number,
            pu.serial_comment::text AS serial_comment,
            i.item_name::text AS item_name
        FROM PurchaseUnits pu
        JOIN PurchaseItems pit ON pu.purchase_item_id = pit.purchase_item_id
        JOIN Items i ON pit.item_id = i.item_id
        WHERE pu.serial_number = p_serial
        LIMIT 1
    ),

    purchase AS (
        SELECT 
            pi.invoice_date AS dt,
            'Purchase'::text AS particulars,
            pi.purchase_invoice_id::text AS reference,
            1 AS qty_in,
            0 AS qty_out,
            p.party_name::text AS party_name,
            pit.unit_price AS purchase_price,
            NULL::numeric AS sale_price
        FROM PurchaseUnits pu
        JOIN PurchaseItems pit ON pu.purchase_item_id = pit.purchase_item_id
        JOIN PurchaseInvoices pi ON pit.purchase_invoice_id = pi.purchase_invoice_id
        JOIN Parties p ON pi.vendor_id = p.party_id
        WHERE pu.serial_number = p_serial
    ),

    purchase_return AS (
        SELECT
            pr.return_date AS dt,
            'Purchase Return'::text AS particulars,
            pr.purchase_return_id::text AS reference,
            0 AS qty_in,
            1 AS qty_out,
            p.party_name::text AS party_name,
            pri.unit_price AS purchase_price,
            NULL::numeric AS sale_price
        FROM PurchaseReturnItems pri
        JOIN PurchaseReturns pr ON pri.purchase_return_id = pr.purchase_return_id
        JOIN Parties p ON pr.vendor_id = p.party_id
        WHERE pri.serial_number = p_serial
    ),

    sale AS (
        SELECT 
            si.invoice_date AS dt,
            'Sale'::text AS particulars,
            si.sales_invoice_id::text AS reference,
            0 AS qty_in,
            1 AS qty_out,
            c.party_name::text AS party_name,
            pit.unit_price AS purchase_price,
            su.sold_price AS sale_price
        FROM SoldUnits su
        JOIN SalesItems sitm ON su.sales_item_id = sitm.sales_item_id
        JOIN SalesInvoices si ON sitm.sales_invoice_id = si.sales_invoice_id
        JOIN Parties c ON si.customer_id = c.party_id
        JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
        JOIN PurchaseItems pit ON pu.purchase_item_id = pit.purchase_item_id
        WHERE pu.serial_number = p_serial
    ),

    sales_return AS (
        SELECT
            sr.return_date AS dt,
            'Sales Return'::text AS particulars,
            sr.sales_return_id::text AS reference,
            1 AS qty_in,
            0 AS qty_out,
            c.party_name::text AS party_name,
            sri.cost_price AS purchase_price,
            sri.sold_price AS sale_price
        FROM SalesReturnItems sri
        JOIN SalesReturns sr ON sri.sales_return_id = sr.sales_return_id
        JOIN Parties c ON sr.customer_id = c.party_id
        WHERE sri.serial_number = p_serial
    )

    SELECT
        ii.serial_number,
        ii.serial_comment,
        ii.item_name,
        l.dt AS txn_date,
        l.particulars,
        l.reference,
        l.qty_in,
        l.qty_out,
        CAST(SUM(l.qty_in - l.qty_out) OVER (ORDER BY l.dt, l.reference) AS INT) AS balance,
        l.party_name,
        l.purchase_price,
        l.sale_price,
        CASE 
            WHEN l.sale_price IS NOT NULL AND l.purchase_price IS NOT NULL 
            THEN l.sale_price - l.purchase_price
        END AS profit
    FROM (
        SELECT * FROM purchase
        UNION ALL SELECT * FROM purchase_return
        UNION ALL SELECT * FROM sale
        UNION ALL SELECT * FROM sales_return
    ) l
    CROSS JOIN item_info ii
    ORDER BY l.dt, l.reference;

END;
$$;
--
-- Name: get_serial_ledger_purchase(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_serial_ledger_purchase(p_serial text) RETURNS TABLE(serial_number text, serial_comment text, item_name text, txn_date date, particulars text, reference text, qty_in integer, qty_out integer, balance integer, party_name text, purchase_price numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY

    WITH item_info AS (
        SELECT 
            pu.serial_number::text,
            pu.serial_comment::text,
            i.item_name::text
        FROM purchaseunits pu
        JOIN purchaseitems pit ON pu.purchase_item_id = pit.purchase_item_id
        JOIN items i ON pit.item_id = i.item_id
        WHERE pu.serial_number = p_serial
        LIMIT 1
    ),

    purchase AS (
        SELECT 
            pi.invoice_date AS dt,
            'Purchase'::text AS particulars,
            pi.purchase_invoice_id::text AS reference,
            1 AS qty_in,
            0 AS qty_out,
            p.party_name::text,
            pit.unit_price AS purchase_price
        FROM purchaseunits pu
        JOIN purchaseitems pit ON pu.purchase_item_id = pit.purchase_item_id
        JOIN purchaseinvoices pi ON pit.purchase_invoice_id = pi.purchase_invoice_id
        JOIN parties p ON pi.vendor_id = p.party_id
        WHERE pu.serial_number = p_serial
    ),

    purchase_return AS (
        SELECT
            pr.return_date AS dt,
            'Purchase Return'::text AS particulars,
            pr.purchase_return_id::text AS reference,
            0 AS qty_in,
            1 AS qty_out,
            p.party_name::text,
            pri.unit_price AS purchase_price
        FROM purchasereturnitems pri
        JOIN purchasereturns pr ON pri.purchase_return_id = pr.purchase_return_id
        JOIN parties p ON pr.vendor_id = p.party_id
        WHERE pri.serial_number = p_serial
    )

    SELECT
        ii.serial_number,
        ii.serial_comment,
        ii.item_name,
        l.dt AS txn_date,
        l.particulars,
        l.reference,
        l.qty_in,
        l.qty_out,
        CAST(SUM(l.qty_in - l.qty_out) OVER (ORDER BY l.dt, l.reference) AS INT) AS balance,
        l.party_name,
        l.purchase_price
    FROM (
        SELECT * FROM purchase
        UNION ALL
        SELECT * FROM purchase_return
    ) l
    CROSS JOIN item_info ii
    ORDER BY l.dt, l.reference;

END;
$$;
--
-- Name: get_serial_ledger_sales(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_serial_ledger_sales(p_serial text) RETURNS TABLE(serial_number text, serial_comment text, item_name text, txn_date date, particulars text, reference text, qty_in integer, qty_out integer, balance integer, party_name text, sale_price numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY

    WITH item_info AS (
        SELECT 
            pu.serial_number::text,
            pu.serial_comment::text,
            i.item_name::text
        FROM purchaseunits pu
        JOIN purchaseitems pit ON pu.purchase_item_id = pit.purchase_item_id
        JOIN items i ON pit.item_id = i.item_id
        WHERE pu.serial_number = p_serial
        LIMIT 1
    ),

    sale AS (
        SELECT 
            si.invoice_date AS dt,
            'Sale'::text AS particulars,
            si.sales_invoice_id::text AS reference,
            0 AS qty_in,
            1 AS qty_out,
            c.party_name::text,
            su.sold_price AS sale_price
        FROM soldunits su
        JOIN salesitems sitm ON su.sales_item_id = sitm.sales_item_id
        JOIN salesinvoices si ON sitm.sales_invoice_id = si.sales_invoice_id
        JOIN parties c ON si.customer_id = c.party_id
        JOIN purchaseunits pu ON su.unit_id = pu.unit_id
        WHERE pu.serial_number = p_serial
    ),

    sales_return AS (
        SELECT
            sr.return_date AS dt,
            'Sales Return'::text AS particulars,
            sr.sales_return_id::text AS reference,
            1 AS qty_in,
            0 AS qty_out,
            c.party_name::text,
            sri.sold_price AS sale_price
        FROM salesreturnitems sri
        JOIN salesreturns sr ON sri.sales_return_id = sr.sales_return_id
        JOIN parties c ON sr.customer_id = c.party_id
        WHERE sri.serial_number = p_serial
    )

    SELECT
        ii.serial_number,
        ii.serial_comment,
        ii.item_name,
        l.dt AS txn_date,
        l.particulars,
        l.reference,
        l.qty_in,
        l.qty_out,
        CAST(SUM(l.qty_in - l.qty_out) OVER (ORDER BY l.dt, l.reference) AS INT) AS balance,
        l.party_name,
        l.sale_price
    FROM (
        SELECT * FROM sale
        UNION ALL
        SELECT * FROM sales_return
    ) l
    CROSS JOIN item_info ii
    ORDER BY l.dt, l.reference;

END;
$$;
--
-- Name: get_serial_number_details(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_serial_number_details(serial text) RETURNS TABLE(serial_number character varying, item_name character varying, brand character varying, category character varying, purchase_invoice_id bigint, vendor_name character varying, purchase_date date, purchase_price numeric, in_stock boolean, sales_invoice_id bigint, customer_name character varying, sale_date date, sold_price numeric, current_status character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        pu.serial_number,
        i.item_name,
        i.brand,
        i.category,
        pi.purchase_invoice_id,
        p.party_name AS vendor_name,
        pi.invoice_date AS purchase_date,
        pit.unit_price AS purchase_price,
        pu.in_stock,
        si.sales_invoice_id,
        c.party_name AS customer_name,
        si.invoice_date AS sale_date,
        su.sold_price,
        COALESCE(su.status, CASE WHEN pu.in_stock THEN 'In Stock' ELSE 'Sold/Unknown' END) AS current_status
    FROM PurchaseUnits pu
    JOIN PurchaseItems pit ON pu.purchase_item_id = pit.purchase_item_id
    JOIN Items i ON pit.item_id = i.item_id
    JOIN PurchaseInvoices pi ON pit.purchase_invoice_id = pi.purchase_invoice_id
    JOIN Parties p ON pi.vendor_id = p.party_id
    LEFT JOIN SoldUnits su ON su.unit_id = pu.unit_id
    LEFT JOIN SalesItems si_itm ON su.sales_item_id = si_itm.sales_item_id
    LEFT JOIN SalesInvoices si ON si_itm.sales_invoice_id = si.sales_invoice_id
    LEFT JOIN Parties c ON si.customer_id = c.party_id
    WHERE pu.serial_number = serial;
END;
$$;
--
-- Name: get_trial_balance_json(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_trial_balance_json() RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(
               jsonb_build_object(
                   'name', name,
                   'balance', balance
               )
           )
    INTO result
    FROM vw_trial_balance;

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
--
-- Name: item_transaction_history(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION item_transaction_history(p_item_name text) RETURNS TABLE(item_name text, serial_number text, transaction_date date, transaction_type text, counterparty text, price numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    WITH purchase_history AS (
        SELECT 
            i.item_id,
            i.item_name::TEXT AS item_name,
            pu.serial_number::TEXT AS serial_number,
            p.invoice_date AS transaction_date,
            'PURCHASE'::TEXT AS transaction_type,
            v.party_name::TEXT AS counterparty,
            pi.unit_price AS price
        FROM PurchaseUnits pu
        JOIN PurchaseItems pi ON pu.purchase_item_id = pi.purchase_item_id
        JOIN PurchaseInvoices p ON pi.purchase_invoice_id = p.purchase_invoice_id
        JOIN Items i ON pi.item_id = i.item_id
        JOIN Parties v ON p.vendor_id = v.party_id
        WHERE i.item_name ILIKE ('%' || p_item_name || '%')
    ),
    sale_history AS (
        SELECT 
            i.item_id,
            i.item_name::TEXT AS item_name,
            pu.serial_number::TEXT AS serial_number,
            s.invoice_date AS transaction_date,
            'SALE'::TEXT AS transaction_type,
            c.party_name::TEXT AS counterparty,
            su.sold_price AS price
        FROM SoldUnits su
        JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
        JOIN SalesItems si ON su.sales_item_id = si.sales_item_id
        JOIN SalesInvoices s ON si.sales_invoice_id = s.sales_invoice_id
        JOIN Items i ON si.item_id = i.item_id
        JOIN Parties c ON s.customer_id = c.party_id
        WHERE i.item_name ILIKE ('%' || p_item_name || '%')
    )
    SELECT 
        ph.item_name,
        ph.serial_number,
        ph.transaction_date,
        ph.transaction_type,
        ph.counterparty,
        ph.price
    FROM (
        SELECT * FROM purchase_history
        UNION ALL
        SELECT * FROM sale_history
    ) AS ph
    ORDER BY ph.transaction_date, 
             ph.transaction_type DESC,   -- ensures PURCHASE before SALE if same date
             ph.serial_number;
END;
$$;
--
-- Name: item_transaction_history(text, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION item_transaction_history(p_item_name text, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date) RETURNS TABLE(item_name text, serial_number text, serial_comment text, transaction_date date, transaction_type text, counterparty text, price numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    WITH purchase_history AS (
        SELECT 
            i.item_id,
            i.item_name::TEXT AS item_name,
            pu.serial_number::TEXT AS serial_number,
            pu.serial_comment::TEXT AS serial_comment,
            p.invoice_date AS transaction_date,
            'PURCHASE'::TEXT AS transaction_type,
            v.party_name::TEXT AS counterparty,
            pi.unit_price AS price
        FROM PurchaseUnits pu
        JOIN PurchaseItems pi ON pu.purchase_item_id = pi.purchase_item_id
        JOIN PurchaseInvoices p ON pi.purchase_invoice_id = p.purchase_invoice_id
        JOIN Items i ON pi.item_id = i.item_id
        JOIN Parties v ON p.vendor_id = v.party_id
        WHERE i.item_name ILIKE ('%' || p_item_name || '%')
          AND (p_from_date IS NULL OR p.invoice_date >= p_from_date)
          AND (p_to_date IS NULL OR p.invoice_date <= p_to_date)
    ),
    sale_history AS (
        SELECT 
            i.item_id,
            i.item_name::TEXT AS item_name,
            pu.serial_number::TEXT AS serial_number,
            pu.serial_comment::TEXT AS serial_comment,
            s.invoice_date AS transaction_date,
            'SALE'::TEXT AS transaction_type,
            c.party_name::TEXT AS counterparty,
            su.sold_price AS price
        FROM SoldUnits su
        JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
        JOIN SalesItems si ON su.sales_item_id = si.sales_item_id
        JOIN SalesInvoices s ON si.sales_invoice_id = s.sales_invoice_id
        JOIN Items i ON si.item_id = i.item_id
        JOIN Parties c ON s.customer_id = c.party_id
        WHERE i.item_name ILIKE ('%' || p_item_name || '%')
          AND (p_from_date IS NULL OR s.invoice_date >= p_from_date)
          AND (p_to_date IS NULL OR s.invoice_date <= p_to_date)
    )
    SELECT 
        ph.item_name,
        ph.serial_number,
        ph.serial_comment,
        ph.transaction_date,
        ph.transaction_type,
        ph.counterparty,
        ph.price
    FROM (
        SELECT * FROM purchase_history
        UNION ALL
        SELECT * FROM sale_history
    ) AS ph
    ORDER BY ph.transaction_date, 
             ph.transaction_type DESC,   -- ensures PURCHASE before SALE if same date
             ph.serial_number;
END;
$$;
--
-- Name: make_payment(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION make_payment(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_party_id   BIGINT;
    v_account_id BIGINT;
    v_amount     NUMERIC(14,4);
    v_method     TEXT;
    v_reference  TEXT;
    v_desc       TEXT;
    v_date       DATE;
    v_id         BIGINT;
    v_created_by INTEGER;
BEGIN
    v_amount     := (p_data->>'amount')::NUMERIC;
    v_method     := p_data->>'method';
    v_reference  := p_data->>'reference_no';
    v_desc       := p_data->>'description';
    v_date       := NULLIF(p_data->>'payment_date', '')::DATE;
    v_created_by := NULLIF(p_data->>'created_by_id', '')::INTEGER;

    IF v_amount IS NULL OR v_amount <= 0 THEN
        RAISE EXCEPTION 'Invalid amount: must be > 0';
    END IF;

    SELECT party_id INTO v_party_id FROM Parties
    WHERE party_name = p_data->>'party_name' LIMIT 1;
    IF v_party_id IS NULL THEN
        RAISE EXCEPTION 'Vendor % not found', p_data->>'party_name';
    END IF;

    SELECT account_id INTO v_account_id FROM ChartOfAccounts
    WHERE account_name = 'Cash';
    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'Cash account not found';
    END IF;

    IF v_reference IS NULL OR v_reference = '' THEN
        v_reference := 'PMT-' || nextval('payments_ref_seq');
    END IF;

    INSERT INTO Payments(party_id, account_id, amount, method, reference_no,
                         description, payment_date, created_by)
    VALUES (v_party_id, v_account_id, v_amount, v_method, v_reference,
            v_desc, COALESCE(v_date, CURRENT_DATE), v_created_by)
    RETURNING payment_id INTO v_id;

    RETURN jsonb_build_object('status', 'success',
                              'message', 'Payment created successfully',
                              'payment_id', v_id);
END;
$$;
--
-- Name: make_receipt(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION make_receipt(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_party_id   BIGINT;
    v_account_id BIGINT;
    v_amount     NUMERIC(14,4);
    v_method     TEXT;
    v_reference  TEXT;
    v_desc       TEXT;
    v_date       DATE;
    v_id         BIGINT;
    v_created_by INTEGER;
BEGIN
    v_amount     := (p_data->>'amount')::NUMERIC;
    v_method     := p_data->>'method';
    v_reference  := p_data->>'reference_no';
    v_desc       := p_data->>'description';
    v_date       := NULLIF(p_data->>'receipt_date', '')::DATE;
    v_created_by := NULLIF(p_data->>'created_by_id', '')::INTEGER;

    IF v_amount IS NULL OR v_amount <= 0 THEN
        RAISE EXCEPTION 'Invalid amount: must be > 0';
    END IF;

    SELECT party_id INTO v_party_id FROM Parties
    WHERE party_name = p_data->>'party_name' LIMIT 1;
    IF v_party_id IS NULL THEN
        RAISE EXCEPTION 'Customer % not found', p_data->>'party_name';
    END IF;

    SELECT account_id INTO v_account_id FROM ChartOfAccounts
    WHERE account_name = 'Cash';
    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'Cash account not found';
    END IF;

    IF v_reference IS NULL OR v_reference = '' THEN
        v_reference := 'RCT-' || nextval('receipts_ref_seq');
    END IF;

    INSERT INTO Receipts(party_id, account_id, amount, method, reference_no,
                         description, receipt_date, created_by)
    VALUES (v_party_id, v_account_id, v_amount, v_method, v_reference,
            v_desc, COALESCE(v_date, CURRENT_DATE), v_created_by)
    RETURNING receipt_id INTO v_id;

    RETURN jsonb_build_object('status', 'success',
                              'message', 'Receipt created successfully',
                              'receipt_id', v_id);
END;
$$;
--
-- Name: monthly_company_position(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION monthly_company_position(p_as_of_date date DEFAULT CURRENT_DATE) RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_stock_worth       NUMERIC(14,2) := 0;
    v_cash_balance      NUMERIC(14,2) := 0;
    v_receivables       JSON;
    v_payables          JSON;
    v_total_receivable  NUMERIC(14,2) := 0;
    v_total_payable     NUMERIC(14,2) := 0;
    v_cash_account_id   BIGINT;
BEGIN

    -- ── 1. Stock Worth (purchase price of all in-stock units) ─────────────────
    SELECT COALESCE(SUM(pi2.unit_price), 0)
    INTO   v_stock_worth
    FROM   purchaseunits pu
    JOIN   purchaseitems pi2 ON pi2.purchase_item_id = pu.purchase_item_id
    WHERE  pu.in_stock = TRUE
      AND  NOT EXISTS (
               SELECT 1 FROM soldunits su
               WHERE su.unit_id = pu.unit_id AND su.status = 'Sold'
           )
      AND  NOT EXISTS (
               SELECT 1 FROM purchasereturnitems pri
               WHERE pri.serial_number = pu.serial_number
           );

    -- ── 2. Cash balance (all journal entries up to p_as_of_date) ─────────────
    SELECT account_id INTO v_cash_account_id
    FROM   chartofaccounts
    WHERE  account_name = 'Cash'
    LIMIT  1;

    IF v_cash_account_id IS NOT NULL THEN
        SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)
        INTO   v_cash_balance
        FROM   journallines jl
        JOIN   journalentries je ON je.journal_id = jl.journal_id
        WHERE  jl.account_id = v_cash_account_id
          AND  je.entry_date <= p_as_of_date;
    END IF;

    -- ── 3. Party Receivables (customers who owe us, up to p_as_of_date) ───────
    WITH party_bal AS (
        SELECT
            p.party_name,
            p.party_type,
            COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0) AS balance
        FROM   parties p
        JOIN   journallines jl    ON jl.party_id   = p.party_id
        JOIN   journalentries je  ON je.journal_id = jl.journal_id
        WHERE  je.entry_date <= p_as_of_date
          AND  p.party_type NOT ILIKE '%expense%'
        GROUP  BY p.party_id, p.party_name, p.party_type
    )
    SELECT
        COALESCE(json_agg(
            json_build_object('name', party_name, 'balance', ROUND(balance,2))
            ORDER BY party_name
        ), '[]'::json),
        COALESCE(SUM(balance), 0)
    INTO v_receivables, v_total_receivable
    FROM party_bal
    WHERE balance > 0;

    -- ── 4. Party Payables (we owe them, up to p_as_of_date) ──────────────────
    WITH party_bal2 AS (
        SELECT
            p.party_name,
            p.party_type,
            COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0) AS balance
        FROM   parties p
        JOIN   journallines jl    ON jl.party_id   = p.party_id
        JOIN   journalentries je  ON je.journal_id = jl.journal_id
        WHERE  je.entry_date <= p_as_of_date
          AND  p.party_type NOT ILIKE '%expense%'
        GROUP  BY p.party_id, p.party_name, p.party_type
    )
    SELECT
        COALESCE(json_agg(
            json_build_object('name', party_name, 'balance', ROUND(ABS(balance),2))
            ORDER BY party_name
        ), '[]'::json),
        COALESCE(SUM(ABS(balance)), 0)
    INTO v_payables, v_total_payable
    FROM party_bal2
    WHERE balance < 0;

    -- ── 5. Build result JSON ──────────────────────────────────────────────────
    RETURN json_build_object(
        'as_of_date',       p_as_of_date,
        'stock_worth',      ROUND(v_stock_worth, 2),
        'cash_balance',     ROUND(v_cash_balance, 2),
        'receivables',      v_receivables,
        'total_party_receivable', ROUND(v_total_receivable, 2),
        'payables',         v_payables,
        'total_payable',    ROUND(v_total_payable, 2)
    );
END;
$$;
--
-- Name: monthly_income_statement(date, date, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION monthly_income_statement(p_from_date date, p_to_date date, p_sales_revenue numeric, p_cogs numeric) RETURNS json
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_gross_profit      NUMERIC(14,2) := 0;
    v_expenses_json     JSON;
    v_total_expenses    NUMERIC(14,2) := 0;
    v_net_income        NUMERIC(14,2) := 0;
BEGIN

    v_gross_profit := p_sales_revenue - p_cogs;

    -- ── Operating Expenses from journal lines in date range ───────────────────
    -- Explicitly exclude 'Cost of Goods Sold' (it is an Expense-type account
    -- but is already accounted for via p_cogs above).
    WITH exp AS (
        SELECT
            coa.account_name                   AS category,
            COALESCE(SUM(jl.debit), 0)         AS amount
        FROM   journallines    jl
        JOIN   journalentries  je  ON je.journal_id  = jl.journal_id
        JOIN   chartofaccounts coa ON coa.account_id = jl.account_id
        WHERE  coa.account_type ILIKE '%expense%'
          AND  coa.account_name NOT ILIKE '%cost of goods%'   -- exclude COGS (supplied manually)
          AND  coa.account_name NOT ILIKE '%profit%'          -- exclude Profit A/C (not an operating expense)
          AND  jl.debit > 0
          AND  je.entry_date BETWEEN p_from_date AND p_to_date
        GROUP  BY coa.account_name
    )
    SELECT
        COALESCE(json_agg(
            json_build_object('category', category, 'amount', ROUND(amount, 2))
            ORDER BY category
        ), '[]'::json),
        COALESCE(SUM(amount), 0)
    INTO v_expenses_json, v_total_expenses
    FROM exp;

    v_net_income := v_gross_profit - v_total_expenses;

    RETURN json_build_object(
        'from_date',        p_from_date,
        'to_date',          p_to_date,
        'sales_revenue',    ROUND(p_sales_revenue, 2),
        'cogs',             ROUND(p_cogs, 2),
        'gross_profit',     ROUND(v_gross_profit, 2),
        'expenses',         v_expenses_json,
        'total_expenses',   ROUND(v_total_expenses, 2),
        'net_income',       ROUND(v_net_income, 2)
    );
END;
$$;
--
-- Name: rebuild_purchase_journal(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION rebuild_purchase_journal(p_invoice_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    j_id BIGINT;
    inv_acc BIGINT;
    party_acc BIGINT;
    v_total NUMERIC(14,2);
BEGIN
    -- 1. Remove old journal if exists
    SELECT journal_id INTO j_id
    FROM PurchaseInvoices
    WHERE purchase_invoice_id = p_invoice_id;

    IF j_id IS NOT NULL THEN
        DELETE FROM JournalEntries WHERE journal_id = j_id;
    END IF;

    -- 2. Get accounts
    SELECT account_id INTO inv_acc FROM ChartOfAccounts WHERE account_name='Inventory';
    SELECT ap_account_id INTO party_acc FROM Parties p
    JOIN PurchaseInvoices pi ON pi.vendor_id = p.party_id
    WHERE pi.purchase_invoice_id = p_invoice_id;

    -- 3. Get invoice total
    SELECT total_amount INTO v_total
    FROM PurchaseInvoices WHERE purchase_invoice_id = p_invoice_id;

    -- 4. Insert new journal entry
    INSERT INTO JournalEntries(entry_date, description)
    SELECT invoice_date, 'Purchase Invoice ' || purchase_invoice_id
    FROM PurchaseInvoices
    WHERE purchase_invoice_id = p_invoice_id
    RETURNING journal_id INTO j_id;

    -- 5. Update invoice with new journal_id
    UPDATE PurchaseInvoices
    SET journal_id = j_id
    WHERE purchase_invoice_id = p_invoice_id;

    -- 6. Debit Inventory
    INSERT INTO JournalLines(journal_id, account_id, debit)
    VALUES (j_id, inv_acc, v_total);

    -- 7. Credit Vendor (AP)
    INSERT INTO JournalLines(journal_id, account_id, party_id, credit)
    VALUES (j_id, party_acc, (
        SELECT vendor_id FROM PurchaseInvoices WHERE purchase_invoice_id = p_invoice_id
    ), v_total);
END;
$$;
--
-- Name: rebuild_purchase_return_journal(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION rebuild_purchase_return_journal(p_return_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    j_id BIGINT;
    inv_acc BIGINT;
    party_acc BIGINT;
    v_total NUMERIC(14,2);
    v_vendor_id BIGINT;
    v_date DATE;
BEGIN
    -- 1. Remove old journal if exists
    SELECT journal_id INTO j_id 
    FROM PurchaseReturns 
    WHERE purchase_return_id = p_return_id;

    IF j_id IS NOT NULL THEN
        DELETE FROM JournalEntries WHERE journal_id = j_id;
    END IF;

    -- 2. Get totals
    SELECT vendor_id, total_amount, return_date
    INTO v_vendor_id, v_total, v_date
    FROM PurchaseReturns 
    WHERE purchase_return_id = p_return_id;

    -- 3. Accounts
    SELECT account_id INTO inv_acc 
    FROM ChartOfAccounts 
    WHERE account_name='Inventory';

    SELECT ap_account_id INTO party_acc 
    FROM Parties 
    WHERE party_id = v_vendor_id;

    -- 4. New journal
    INSERT INTO JournalEntries(entry_date, description)
    VALUES (v_date, 'Purchase Return ' || p_return_id)
    RETURNING journal_id INTO j_id;

    UPDATE PurchaseReturns 
    SET journal_id = j_id 
    WHERE purchase_return_id = p_return_id;

    -- 5. Journal lines (with conditions)
    -- (1) Debit Vendor (reduce AP balance)
    IF v_total > 0 THEN
        INSERT INTO JournalLines(journal_id, account_id, party_id, debit)
        VALUES (j_id, party_acc, v_vendor_id, v_total);
    END IF;

    -- (2) Credit Inventory (stock reduced)
    IF v_total > 0 THEN
        INSERT INTO JournalLines(journal_id, account_id, credit)
        VALUES (j_id, inv_acc, v_total);
    END IF;
END;
$$;
--
-- Name: rebuild_sales_journal(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION rebuild_sales_journal(p_invoice_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    j_id BIGINT;
    rev_acc BIGINT;
    party_acc BIGINT;
    cogs_acc BIGINT;
    inv_acc BIGINT;
    total_cost NUMERIC(14,2);
    total_revenue NUMERIC(14,2);
    v_customer_id BIGINT;
    v_invoice_date DATE;
BEGIN
    -- 1. Get existing journal_id (if any)
    SELECT journal_id INTO j_id
    FROM SalesInvoices
    WHERE sales_invoice_id = p_invoice_id;

    -- 2. If exists, clear old lines + entry
    IF j_id IS NOT NULL THEN
        DELETE FROM JournalLines WHERE journal_id = j_id;
        DELETE FROM JournalEntries WHERE journal_id = j_id;
    END IF;

    -- 3. Get invoice details
    SELECT s.customer_id, s.total_amount, s.invoice_date
    INTO v_customer_id, total_revenue, v_invoice_date
    FROM SalesInvoices s
    WHERE s.sales_invoice_id = p_invoice_id;

    -- 4. Get accounts
    SELECT account_id INTO rev_acc FROM ChartOfAccounts WHERE account_name='Sales Revenue';
    SELECT account_id INTO cogs_acc FROM ChartOfAccounts WHERE account_name='Cost of Goods Sold';
    SELECT account_id INTO inv_acc FROM ChartOfAccounts WHERE account_name='Inventory';
    SELECT ar_account_id INTO party_acc FROM Parties WHERE party_id = v_customer_id;

    -- 5. Insert new journal entry
    INSERT INTO JournalEntries(entry_date, description)
    VALUES (v_invoice_date, 'Sale Invoice ' || p_invoice_id)
    RETURNING journal_id INTO j_id;

    -- 6. Update invoice with new journal_id
    UPDATE SalesInvoices
    SET journal_id = j_id
    WHERE sales_invoice_id = p_invoice_id;

    -- (1) Debit Customer (AR)
    INSERT INTO JournalLines(journal_id, account_id, party_id, debit)
    VALUES (j_id, party_acc, v_customer_id, total_revenue);

    -- (2) Credit Revenue
    INSERT INTO JournalLines(journal_id, account_id, credit)
    VALUES (j_id, rev_acc, total_revenue);

    -- (3) Debit COGS / Credit Inventory
    SELECT COALESCE(SUM(pi.unit_price),0) INTO total_cost
    FROM SoldUnits su
    JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
    JOIN PurchaseItems pi ON pu.purchase_item_id = pi.purchase_item_id
    JOIN SalesItems si ON su.sales_item_id = si.sales_item_id
    WHERE si.sales_invoice_id = p_invoice_id;

    IF total_cost > 0 THEN
        INSERT INTO JournalLines(journal_id, account_id, debit)
        VALUES (j_id, cogs_acc, total_cost);

        INSERT INTO JournalLines(journal_id, account_id, credit)
        VALUES (j_id, inv_acc, total_cost);
    END IF;
END;
$$;
--
-- Name: rebuild_sales_return_journal(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION rebuild_sales_return_journal(p_return_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    j_id BIGINT;
    rev_acc BIGINT;
    cogs_acc BIGINT;
    inv_acc BIGINT;
    party_acc BIGINT;
    v_total NUMERIC(14,2);
    v_cost NUMERIC(14,2);
    v_customer_id BIGINT;
    v_date DATE;
BEGIN
    -- remove old journal
    SELECT journal_id INTO j_id FROM SalesReturns WHERE sales_return_id = p_return_id;
    IF j_id IS NOT NULL THEN
        DELETE FROM JournalEntries WHERE journal_id = j_id;
    END IF;

    -- totals
    SELECT customer_id, total_amount, return_date
    INTO v_customer_id, v_total, v_date
    FROM SalesReturns WHERE sales_return_id = p_return_id;

    SELECT COALESCE(SUM(cost_price),0) INTO v_cost
    FROM SalesReturnItems WHERE sales_return_id = p_return_id;

    -- accounts
    SELECT account_id INTO rev_acc FROM ChartOfAccounts WHERE account_name='Sales Revenue';
    SELECT account_id INTO cogs_acc FROM ChartOfAccounts WHERE account_name='Cost of Goods Sold';
    SELECT account_id INTO inv_acc FROM ChartOfAccounts WHERE account_name='Inventory';
    SELECT ar_account_id INTO party_acc FROM Parties WHERE party_id = v_customer_id;

    -- new journal
    INSERT INTO JournalEntries(entry_date, description)
    VALUES (v_date, 'Sales Return ' || p_return_id)
    RETURNING journal_id INTO j_id;

    UPDATE SalesReturns SET journal_id = j_id WHERE sales_return_id = p_return_id;

    -- (1) Debit Sales Revenue
    IF v_total > 0 THEN
        INSERT INTO JournalLines(journal_id, account_id, debit)
        VALUES (j_id, rev_acc, v_total);
    END IF;

    -- (2) Credit Customer AR
    IF v_total > 0 THEN
        INSERT INTO JournalLines(journal_id, account_id, party_id, credit)
        VALUES (j_id, party_acc, v_customer_id, v_total);
    END IF;

    -- (3) Debit Inventory
    IF v_cost > 0 THEN
        INSERT INTO JournalLines(journal_id, account_id, debit)
        VALUES (j_id, inv_acc, v_cost);
    END IF;

    -- (4) Credit COGS
    IF v_cost > 0 THEN
        INSERT INTO JournalLines(journal_id, account_id, credit)
        VALUES (j_id, cogs_acc, v_cost);
    END IF;
END;
$$;
--
-- Name: sale_wise_profit(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION sale_wise_profit(p_from_date date, p_to_date date) RETURNS TABLE(sale_date date, item_name text, serial_number text, serial_comment text, sale_price numeric, purchase_price numeric, profit_loss numeric, profit_loss_percent numeric, vendor_name text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    WITH sold_serials AS (
        SELECT 
            su.sold_unit_id,
            su.sold_price,
            pu.serial_number::TEXT AS serial_number,
            pu.serial_comment::TEXT AS serial_comment,
            si.sales_item_id,
            s.sales_invoice_id,
            s.invoice_date AS sale_date,
            i.item_name::TEXT AS item_name,
            i.item_code,
            i.brand,
            i.category,
            si.item_id,
            pu.unit_id
        FROM SoldUnits su
        JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
        JOIN SalesItems si ON su.sales_item_id = si.sales_item_id
        JOIN SalesInvoices s ON si.sales_invoice_id = s.sales_invoice_id
        JOIN Items i ON si.item_id = i.item_id
        WHERE s.invoice_date BETWEEN p_from_date AND p_to_date
    ),
    purchased_serials AS (
        SELECT 
            pu.unit_id,
            pu.serial_number::TEXT AS serial_number,
            pi.purchase_item_id,
            p.purchase_invoice_id,
            p.vendor_id,
            i.item_id,
            i.item_name::TEXT AS item_name,
            pi.unit_price AS purchase_price
        FROM PurchaseUnits pu
        JOIN PurchaseItems pi ON pu.purchase_item_id = pi.purchase_item_id
        JOIN PurchaseInvoices p ON pi.purchase_invoice_id = p.purchase_invoice_id
        JOIN Items i ON pi.item_id = i.item_id
    )
    SELECT 
        ss.sale_date,
        ss.item_name,
        ss.serial_number,
        ss.serial_comment,
        ss.sold_price AS sale_price,
        ps.purchase_price,
        ROUND(ss.sold_price - ps.purchase_price, 2) AS profit_loss,
        CASE 
            WHEN ps.purchase_price > 0 THEN 
                ROUND(((ss.sold_price - ps.purchase_price) / ps.purchase_price) * 100, 2)
            ELSE 
                NULL
        END AS profit_loss_percent,
        v.party_name::TEXT AS vendor_name
    FROM sold_serials ss
    LEFT JOIN purchased_serials ps 
        ON ss.unit_id = ps.unit_id
    LEFT JOIN Parties v 
        ON ps.vendor_id = v.party_id
    ORDER BY ss.sale_date, ss.item_name, ss.serial_number;
END;
$$;
--
-- Name: serial_exists_in_purchase_return(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION serial_exists_in_purchase_return(p_purchase_return_id bigint, p_serial_number text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT TRUE
    INTO v_exists
    FROM PurchaseReturnItems
    WHERE purchase_return_id = p_purchase_return_id
      AND serial_number = p_serial_number
    LIMIT 1;

    RETURN COALESCE(v_exists, FALSE);
END;
$$;
--
-- Name: serial_exists_in_sales_return(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION serial_exists_in_sales_return(p_sales_return_id bigint, p_serial_number text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT TRUE
    INTO v_exists
    FROM SalesReturnItems
    WHERE sales_return_id = p_sales_return_id
      AND serial_number = p_serial_number
    LIMIT 1;

    RETURN COALESCE(v_exists, FALSE);
END;
$$;
--
-- Name: stock_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION stock_summary() RETURNS TABLE(item_id bigint, item_name character varying, category character varying, brand character varying, quantity_in_stock bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        i.item_id,
        i.item_name,
        i.category,
        i.brand,
        COUNT(pu.unit_id) FILTER (
            WHERE pu.in_stock = TRUE
              AND NOT EXISTS (
                  SELECT 1 FROM soldunits su
                  WHERE su.unit_id = pu.unit_id AND su.status = 'Sold'
              )
              AND NOT EXISTS (
                  SELECT 1 FROM purchasereturnitems pri
                  WHERE pri.serial_number = pu.serial_number
              )
        ) AS quantity_in_stock
    FROM Items i
    LEFT JOIN PurchaseItems pi ON i.item_id = pi.item_id
    LEFT JOIN PurchaseUnits pu ON pi.purchase_item_id = pu.purchase_item_id
    GROUP BY i.item_id, i.item_name, i.category, i.brand
    ORDER BY i.item_name ASC;
END;
$$;
--
-- Name: trg_fn_soldunits_fix_ghost_stock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION trg_fn_soldunits_fix_ghost_stock() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_fixed INT;
BEGIN
    -- After the full statement is done, find every serial that is
    -- stuck as in_stock = FALSE but has no soldunits row (Sold or
    -- Returned) and no purchase return record to justify it, and
    -- restore it to in_stock = TRUE in one single UPDATE.

    UPDATE purchaseunits pu
    SET    in_stock = TRUE
    WHERE  pu.in_stock = FALSE
      AND  NOT EXISTS (
               SELECT 1
               FROM   soldunits su
               WHERE  su.unit_id = pu.unit_id
                 AND  su.status IN ('Sold', 'Returned')
           )
      AND  NOT EXISTS (
               SELECT 1
               FROM   purchasereturnitems pri
               WHERE  pri.serial_number = pu.serial_number
           );

    RETURN NULL;
END;
$$;
--
-- Name: FUNCTION trg_fn_soldunits_fix_ghost_stock(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION trg_fn_soldunits_fix_ghost_stock() IS 'Statement-level trigger function. Runs once after each INSERT,
UPDATE, or DELETE statement on soldunits finishes completely.
Restores in_stock = TRUE for any serial that no longer has a
soldunits or purchasereturnitems record to justify being out of stock.';
--
-- Name: trg_party_opening_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION trg_party_opening_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    j_id BIGINT;
    debit_acc BIGINT;
    credit_acc BIGINT;
    cap_acc BIGINT;
BEGIN
    IF NEW.opening_balance > 0 THEN
        -- Owner's Capital account
        SELECT account_id INTO cap_acc 
        FROM ChartOfAccounts 
        WHERE account_name = 'Owner''s Capital';

        IF cap_acc IS NULL THEN
            RAISE EXCEPTION 'Owner''s Capital account not found in COA';
        END IF;

        -- Create a new Journal Entry
        INSERT INTO JournalEntries(entry_date, description)
        VALUES (CURRENT_DATE, 'Opening Balance for ' || NEW.party_name)
        RETURNING journal_id INTO j_id;

        -- ---------------------------
        -- CUSTOMER or BOTH
        -- ---------------------------
        IF NEW.party_type IN ('Customer','Both') AND NEW.balance_type = 'Debit' THEN
            debit_acc := NEW.ar_account_id;
            credit_acc := cap_acc;

            INSERT INTO JournalLines(journal_id, account_id, party_id, debit)
            VALUES (j_id, debit_acc, NEW.party_id, NEW.opening_balance);

            INSERT INTO JournalLines(journal_id, account_id, credit)
            VALUES (j_id, credit_acc, NEW.opening_balance);
        END IF;

        -- ---------------------------
        -- VENDOR or BOTH
        -- ---------------------------
        IF NEW.party_type IN ('Vendor','Both') AND NEW.balance_type = 'Credit' THEN
            debit_acc := cap_acc;
            credit_acc := NEW.ap_account_id;

            INSERT INTO JournalLines(journal_id, account_id, debit)
            VALUES (j_id, debit_acc, NEW.opening_balance);

            INSERT INTO JournalLines(journal_id, account_id, party_id, credit)
            VALUES (j_id, credit_acc, NEW.party_id, NEW.opening_balance);
        END IF;

        -- ---------------------------
        -- EXPENSE PARTY
        -- ---------------------------
        IF NEW.party_type = 'Expense' THEN
            debit_acc := NEW.ap_account_id;  -- Expense account
            credit_acc := cap_acc;           -- Funded by Owner's Capital

            INSERT INTO JournalLines(journal_id, account_id, party_id, debit)
            VALUES (j_id, debit_acc, NEW.party_id, NEW.opening_balance);

            INSERT INTO JournalLines(journal_id, account_id, credit)
            VALUES (j_id, credit_acc, NEW.opening_balance);
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
--
-- Name: trg_payment_journal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION trg_payment_journal() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    j_id BIGINT;
    party_acc BIGINT;
    v_party_name  TEXT;
    journal_desc TEXT;
BEGIN
    -- Handle DELETE: remove related journal
    IF TG_OP = 'DELETE' THEN
        DELETE FROM JournalEntries WHERE journal_id = OLD.journal_id;
        RETURN OLD;
    END IF;

    -- Handle UPDATE: only regenerate if relevant fields changed
    IF TG_OP = 'UPDATE' THEN
        IF OLD.amount = NEW.amount
           AND OLD.account_id = NEW.account_id
           AND OLD.party_id = NEW.party_id
           AND OLD.description IS NOT DISTINCT FROM NEW.description
           AND OLD.payment_date = NEW.payment_date THEN
            RETURN NEW;
        END IF;

        DELETE FROM JournalEntries WHERE journal_id = OLD.journal_id;
    END IF;

    -- Handle INSERT or UPDATE
    IF TG_OP IN ('INSERT','UPDATE') THEN
        -- Find AP account for vendor
        SELECT ap_account_id, p.party_name
        INTO party_acc, v_party_name
        FROM Parties AS p
        WHERE party_id = NEW.party_id;

        IF party_acc IS NULL THEN
            RAISE EXCEPTION 'No AP account found for vendor %', NEW.party_id;
        END IF;

        -- Description: custom if provided, else fallback with ref no
        journal_desc := COALESCE(
            NEW.description,
            'Payment to ' || v_party_name ||
            CASE WHEN NEW.reference_no IS NOT NULL AND NEW.reference_no <> '' 
                 THEN ' (Ref: ' || NEW.reference_no || ')'
                 ELSE '' END
        );

        -- Insert Journal Entry
        INSERT INTO JournalEntries(entry_date, description)
        VALUES (NEW.payment_date, journal_desc)
        RETURNING journal_id INTO j_id;

        -- Prevent recursion when linking back
        PERFORM pg_catalog.set_config('session_replication_role', 'replica', true);
        UPDATE Payments
        SET journal_id = j_id
        WHERE payment_id = NEW.payment_id;
        PERFORM pg_catalog.set_config('session_replication_role', 'origin', true);

        -- Debit Vendor (reduce liability)
        INSERT INTO JournalLines(journal_id, account_id, party_id, debit)
        VALUES (j_id, party_acc, NEW.party_id, NEW.amount);

        -- Credit Cash/Bank
        INSERT INTO JournalLines(journal_id, account_id, credit)
        VALUES (j_id, NEW.account_id, NEW.amount);
    END IF;

    RETURN NEW;
END;
$$;
--
-- Name: trg_receipt_journal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION trg_receipt_journal() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    j_id BIGINT;
    party_acc BIGINT;
    v_party_name  TEXT;
    journal_desc TEXT;
BEGIN
    -- Handle DELETE: remove related journal
    IF TG_OP = 'DELETE' THEN
        DELETE FROM JournalEntries WHERE journal_id = OLD.journal_id;
        RETURN OLD;
    END IF;

    -- Handle UPDATE: only regenerate if relevant fields changed
    IF TG_OP = 'UPDATE' THEN
        IF OLD.amount = NEW.amount
           AND OLD.account_id = NEW.account_id
           AND OLD.party_id = NEW.party_id
           AND OLD.description IS NOT DISTINCT FROM NEW.description
           AND OLD.receipt_date = NEW.receipt_date THEN
            RETURN NEW;
        END IF;

        DELETE FROM JournalEntries WHERE journal_id = OLD.journal_id;
    END IF;

    -- Handle INSERT or UPDATE
    IF TG_OP IN ('INSERT','UPDATE') THEN
        -- Find AR account for customer
        SELECT ar_account_id, p.party_name
        INTO party_acc, v_party_name
        FROM Parties AS p
        WHERE party_id = NEW.party_id;

        IF party_acc IS NULL THEN
            RAISE EXCEPTION 'No AR account found for customer %', NEW.party_id;
        END IF;

        -- Description: custom if provided, else fallback with ref no
        journal_desc := COALESCE(
            NEW.description,
            'Receipt from ' || v_party_name ||
            CASE WHEN NEW.reference_no IS NOT NULL AND NEW.reference_no <> '' 
                 THEN ' (Ref: ' || NEW.reference_no || ')'
                 ELSE '' END
        );

        -- Insert Journal Entry
        INSERT INTO JournalEntries(entry_date, description)
        VALUES (NEW.receipt_date, journal_desc)
        RETURNING journal_id INTO j_id;

        -- Prevent recursion when linking back
        PERFORM pg_catalog.set_config('session_replication_role', 'replica', true);
        UPDATE Receipts
        SET journal_id = j_id
        WHERE receipt_id = NEW.receipt_id;
        PERFORM pg_catalog.set_config('session_replication_role', 'origin', true);

        -- Debit Cash/Bank (increase asset)
        INSERT INTO JournalLines(journal_id, account_id, debit)
        VALUES (j_id, NEW.account_id, NEW.amount);

        -- Credit Customer (reduce receivable)
        INSERT INTO JournalLines(journal_id, account_id, party_id, credit)
        VALUES (j_id, party_acc, NEW.party_id, NEW.amount);
    END IF;

    RETURN NEW;
END;
$$;
--
-- Name: update_item_from_json(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION update_item_from_json(item_data jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE Items
    SET
        item_name   = COALESCE(item_data->>'item_name', item_name),
        storage     = COALESCE(item_data->>'storage', storage),
        sale_price  = COALESCE(NULLIF(item_data->>'sale_price','')::NUMERIC, sale_price),
        item_code   = COALESCE(NULLIF(item_data->>'item_code',''), item_code),
        category    = COALESCE(NULLIF(item_data->>'category',''), category),
        brand       = COALESCE(NULLIF(item_data->>'brand',''), brand),
        updated_at  = NOW(),
        -- Update last modifier if provided
        created_by  = CASE
                        WHEN NULLIF(item_data->>'created_by_id', '') IS NOT NULL
                        THEN (item_data->>'created_by_id')::INTEGER
                        ELSE created_by
                      END
    WHERE item_id = (item_data->>'item_id')::BIGINT;
END;
$$;
--
-- Name: update_party_from_json(bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION update_party_from_json(p_id bigint, party_data jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    old_opening          NUMERIC(14,2);
    old_balance_type     VARCHAR(10);
    old_party_type       VARCHAR(20);
    old_party_name       VARCHAR(150);
    new_opening          NUMERIC(14,2);
    new_balance_type     VARCHAR(10);
    new_party_type       VARCHAR(20);
    new_party_name       VARCHAR(150);
    cap_acc              BIGINT;
    j_id                 BIGINT;
    debit_acc            BIGINT;
    credit_acc           BIGINT;
    v_expense_account_id BIGINT;
BEGIN
    -- Fetch existing data
    SELECT opening_balance, balance_type, party_type, party_name
    INTO old_opening, old_balance_type, old_party_type, old_party_name
    FROM Parties WHERE party_id = p_id;

    -- Parse new values
    new_opening      := COALESCE((party_data->>'opening_balance')::NUMERIC, old_opening);
    new_balance_type := COALESCE(party_data->>'balance_type', old_balance_type);
    new_party_type   := COALESCE(party_data->>'party_type', old_party_type);
    new_party_name   := COALESCE(party_data->>'party_name', old_party_name);

    -- Expense party logic (unchanged)
    IF new_party_type = 'Expense' THEN
        SELECT ap_account_id INTO v_expense_account_id FROM Parties WHERE party_id = p_id;
        IF v_expense_account_id IS NOT NULL THEN
            UPDATE ChartOfAccounts SET account_name = new_party_name
            WHERE account_id = v_expense_account_id;
        ELSE
            INSERT INTO ChartOfAccounts(account_code, account_name, account_type, parent_account, date_created)
            VALUES (
                CONCAT('EXP-', LPAD((SELECT COUNT(*)+1 FROM ChartOfAccounts WHERE account_type='Expense')::TEXT, 4, '0')),
                new_party_name, 'Expense',
                (SELECT account_id FROM ChartOfAccounts WHERE account_name ILIKE 'Expenses' LIMIT 1),
                CURRENT_TIMESTAMP
            ) RETURNING account_id INTO v_expense_account_id;
        END IF;
    END IF;

    -- Update party (unchanged)
    UPDATE Parties
    SET
        party_name      = new_party_name,
        party_type      = new_party_type,
        contact_info    = COALESCE(party_data->>'contact_info', contact_info),
        address         = COALESCE(party_data->>'address', address),
        opening_balance = new_opening,
        balance_type    = new_balance_type,
        ar_account_id   = CASE
                            WHEN new_party_type IN ('Customer','Both')
                            THEN (SELECT account_id FROM ChartOfAccounts WHERE account_name ILIKE 'Accounts Receivable' LIMIT 1)
                            ELSE NULL END,
        ap_account_id   = CASE
                            WHEN new_party_type IN ('Vendor','Both')
                                THEN (SELECT account_id FROM ChartOfAccounts WHERE account_name ILIKE 'Accounts Payable' LIMIT 1)
                            WHEN new_party_type = 'Expense'
                                THEN v_expense_account_id
                            ELSE NULL END,
        created_by      = CASE
                            WHEN NULLIF(party_data->>'created_by_id', '') IS NOT NULL
                            THEN (party_data->>'created_by_id')::INTEGER
                            ELSE created_by
                          END
    WHERE party_id = p_id;

    -- Sync journal description if party name changed (unchanged)
    IF new_party_name IS DISTINCT FROM old_party_name THEN
        UPDATE JournalEntries
        SET description = 'Opening Balance for ' || new_party_name
        WHERE journal_id IN (
            SELECT DISTINCT jl.journal_id FROM JournalLines jl WHERE jl.party_id = p_id
        )
        AND description ILIKE 'Opening Balance for%';
    END IF;

    -- Handle opening balance changes
    IF new_opening IS DISTINCT FROM old_opening
       OR new_balance_type IS DISTINCT FROM old_balance_type
       OR new_party_type IS DISTINCT FROM old_party_type THEN

        DELETE FROM JournalEntries je
        WHERE je.description ILIKE 'Opening Balance for%'
          AND je.journal_id IN (
              SELECT jl.journal_id FROM JournalLines jl WHERE jl.party_id = p_id
          );

        IF new_opening <> 0 THEN

            -- FIX 1: was 'Capital' — correct name is 'Owner''s Capital'
            SELECT account_id INTO cap_acc
            FROM ChartOfAccounts
            WHERE account_name = 'Owner''s Capital';

            INSERT INTO JournalEntries(entry_date, description)
            VALUES (CURRENT_DATE, 'Opening Balance for ' || new_party_name)
            RETURNING journal_id INTO j_id;

            IF new_balance_type = 'Debit' THEN
                SELECT ar_account_id INTO debit_acc FROM Parties WHERE party_id = p_id;
                credit_acc := cap_acc;
            ELSE
                SELECT ap_account_id INTO credit_acc FROM Parties WHERE party_id = p_id;
                debit_acc := cap_acc;
            END IF;

            -- FIX 2: mirror the trigger exactly —
            --   party side (AR or AP)  → party_id = p_id
            --   capital side           → NO party_id (omit the column)

            IF new_balance_type = 'Debit' THEN
                -- Debit AR (party side)
                INSERT INTO JournalLines(journal_id, account_id, party_id, debit, credit)
                VALUES (j_id, debit_acc, p_id, new_opening, 0);
                -- Credit Capital (no party_id)
                INSERT INTO JournalLines(journal_id, account_id, debit, credit)
                VALUES (j_id, credit_acc, 0, new_opening);
            ELSE
                -- Debit Capital (no party_id)
                INSERT INTO JournalLines(journal_id, account_id, debit, credit)
                VALUES (j_id, debit_acc, new_opening, 0);
                -- Credit AP (party side)
                INSERT INTO JournalLines(journal_id, account_id, party_id, debit, credit)
                VALUES (j_id, credit_acc, p_id, 0, new_opening);
            END IF;

        END IF;
    END IF;
END;
$$;
--
-- Name: update_payment(bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION update_payment(p_payment_id bigint, p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_amount     NUMERIC(14,4);
    v_method     TEXT;
    v_reference  TEXT;
    v_desc       TEXT;
    v_date       DATE;
    v_party_id   BIGINT;
    v_created_by INTEGER;
    v_updated    RECORD;
BEGIN
    v_amount     := NULLIF(p_data->>'amount','')::NUMERIC;
    v_method     := NULLIF(p_data->>'method','');
    v_reference  := NULLIF(p_data->>'reference_no','');
    v_desc       := NULLIF(p_data->>'description','');
    v_date       := NULLIF(p_data->>'payment_date','')::DATE;
    v_created_by := NULLIF(p_data->>'created_by_id','')::INTEGER;

    IF p_data ? 'party_name' THEN
        SELECT party_id INTO v_party_id
        FROM Parties
        WHERE party_name = p_data->>'party_name'
        LIMIT 1;
        IF v_party_id IS NULL THEN
            RAISE EXCEPTION 'Vendor % not found', p_data->>'party_name';
        END IF;
    END IF;

    IF v_amount IS NOT NULL AND v_amount <= 0 THEN
        RAISE EXCEPTION 'Invalid amount';
    END IF;

    UPDATE Payments
    SET amount       = COALESCE(v_amount,     amount),
        method       = COALESCE(v_method,     method),
        reference_no = COALESCE(v_reference,  reference_no),
        party_id     = COALESCE(v_party_id,   party_id),
        description  = COALESCE(v_desc,       description),
        payment_date = COALESCE(v_date,       payment_date),
        created_by   = COALESCE(v_created_by, created_by)   -- NEW
    WHERE payment_id = p_payment_id
    RETURNING * INTO v_updated;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment ID % not found', p_payment_id;
    END IF;

    RETURN jsonb_build_object(
        'status',  'success',
        'message', 'Payment updated successfully',
        'payment', to_jsonb(v_updated)
    );
END;
$$;
--
-- Name: update_purchase_invoice(bigint, jsonb, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION update_purchase_invoice(p_invoice_id bigint, p_items jsonb, p_party_name text DEFAULT NULL::text, p_invoice_date date DEFAULT NULL::date) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_item JSONB;
    v_item_id BIGINT;
    v_total NUMERIC(14,2) := 0;
    v_purchase_item_id BIGINT;
    v_serial JSONB;
    v_new_party_id BIGINT;
    v_existing_serials TEXT[];
    v_new_serials TEXT[];
    v_serials_to_remove TEXT[];
    v_serials_to_keep TEXT[];
    v_validation JSONB;
    v_temp_item_id BIGINT := -999999;
BEGIN

    -- VALIDATE
    v_validation := validate_purchase_update2(p_invoice_id, p_items);
    
    IF (v_validation->>'is_valid')::BOOLEAN = FALSE THEN
        RAISE EXCEPTION '%', v_validation->>'message';
    END IF;

    -- Update Party
    IF p_party_name IS NOT NULL THEN
        SELECT party_id INTO v_new_party_id
        FROM Parties
        WHERE party_name = p_party_name
        LIMIT 1;

        IF v_new_party_id IS NULL THEN
            RAISE EXCEPTION 'Vendor "%" not found.', p_party_name;
        END IF;

        UPDATE PurchaseInvoices
        SET vendor_id = v_new_party_id
        WHERE purchase_invoice_id = p_invoice_id;
    END IF;

    -- Update Date
    IF p_invoice_date IS NOT NULL THEN
        UPDATE PurchaseInvoices
        SET invoice_date = p_invoice_date
        WHERE purchase_invoice_id = p_invoice_id;
    END IF;

    -- Existing serials
    SELECT ARRAY_AGG(pu.serial_number)
    INTO v_existing_serials
    FROM PurchaseUnits pu
    JOIN PurchaseItems pi ON pu.purchase_item_id = pi.purchase_item_id
    WHERE pi.purchase_invoice_id = p_invoice_id;

    IF v_existing_serials IS NULL THEN
        v_existing_serials := ARRAY[]::TEXT[];
    END IF;

    -- New serials from JSON objects
    SELECT ARRAY_AGG(serial_obj->>'serial')
    INTO v_new_serials
    FROM jsonb_array_elements(p_items) AS item,
         jsonb_array_elements(item->'serials') AS serial_obj;

    IF v_new_serials IS NULL THEN
        v_new_serials := ARRAY[]::TEXT[];
    END IF;

    -- Serials to remove
    SELECT ARRAY_AGG(s)
    INTO v_serials_to_remove
    FROM unnest(v_existing_serials) AS s
    WHERE s <> ALL(v_new_serials);

    IF v_serials_to_remove IS NULL THEN
        v_serials_to_remove := ARRAY[]::TEXT[];
    END IF;

    -- Serials to keep
    SELECT ARRAY_AGG(s)
    INTO v_serials_to_keep
    FROM unnest(v_existing_serials) AS s
    WHERE s = ANY(v_new_serials);

    IF v_serials_to_keep IS NULL THEN
        v_serials_to_keep := ARRAY[]::TEXT[];
    END IF;

    -- TEMP ITEM
    INSERT INTO PurchaseItems(purchase_invoice_id, item_id, quantity, unit_price)
    VALUES (p_invoice_id, 1, 1, 0)
    RETURNING purchase_item_id INTO v_temp_item_id;

    UPDATE PurchaseUnits
    SET purchase_item_id = v_temp_item_id
    WHERE serial_number = ANY(v_serials_to_keep);

    -- Remove stock movements
    DELETE FROM StockMovements 
    WHERE reference_type = 'PurchaseInvoice' 
      AND reference_id = p_invoice_id
      AND serial_number = ANY(v_serials_to_remove);

    -- Delete old items
    DELETE FROM PurchaseItems 
    WHERE purchase_invoice_id = p_invoice_id
      AND purchase_item_id != v_temp_item_id;

    -- Recreate items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT item_id INTO v_item_id 
        FROM Items 
        WHERE item_name = (v_item->>'item_name') 
        LIMIT 1;
        
        IF v_item_id IS NULL THEN
            INSERT INTO Items(item_name, sale_price)
            VALUES ((v_item->>'item_name'), (v_item->>'unit_price')::NUMERIC)
            RETURNING item_id INTO v_item_id;
        END IF;

        INSERT INTO PurchaseItems(purchase_invoice_id, item_id, quantity, unit_price)
        VALUES (
            p_invoice_id,
            v_item_id,
            (v_item->>'qty')::INT,
            (v_item->>'unit_price')::NUMERIC
        )
        RETURNING purchase_item_id INTO v_purchase_item_id;

        v_total := v_total + ((v_item->>'qty')::INT * (v_item->>'unit_price')::NUMERIC);

        -- SERIAL HANDLING WITH COMMENTS
        FOR v_serial IN SELECT * FROM jsonb_array_elements(v_item->'serials')
        LOOP
            IF (v_serial->>'serial') = ANY(v_serials_to_keep) THEN
                
                UPDATE PurchaseUnits
                SET purchase_item_id = v_purchase_item_id,
                    serial_comment = NULLIF(TRIM(COALESCE(v_serial->>'comment','')), '')
                WHERE serial_number = v_serial->>'serial'
                  AND purchase_item_id = v_temp_item_id;

            ELSE
                INSERT INTO PurchaseUnits(
                    purchase_item_id,
                    serial_number,
                    serial_comment,
                    in_stock
                )
                VALUES (
                    v_purchase_item_id,
                    v_serial->>'serial',
                    NULLIF(TRIM(COALESCE(v_serial->>'comment','')), ''),
                    TRUE
                );

                INSERT INTO StockMovements(
                    item_id, serial_number, movement_type,
                    reference_type, reference_id, quantity
                )
                VALUES (
                    v_item_id,
                    v_serial->>'serial',
                    'IN',
                    'PurchaseInvoice',
                    p_invoice_id,
                    1
                );
            END IF;
        END LOOP;
    END LOOP;

    DELETE FROM PurchaseItems WHERE purchase_item_id = v_temp_item_id;

    UPDATE PurchaseInvoices
    SET total_amount = v_total
    WHERE purchase_invoice_id = p_invoice_id;

    PERFORM rebuild_purchase_journal(p_invoice_id);

END;
$$;
--
-- Name: update_purchase_invoice(bigint, jsonb, text, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION update_purchase_invoice(p_invoice_id bigint, p_items jsonb, p_party_name text DEFAULT NULL::text, p_invoice_date date DEFAULT NULL::date, p_created_by integer DEFAULT NULL::integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_item              JSONB;
    v_item_id           BIGINT;
    v_total             NUMERIC(14,2) := 0;
    v_purchase_item_id  BIGINT;
    v_serial            JSONB;
    v_new_party_id      BIGINT;
    v_existing_serials  TEXT[];
    v_new_serials       TEXT[];
    v_serials_to_remove TEXT[];
    v_serials_to_keep   TEXT[];
    v_validation        JSONB;
    v_temp_item_id      BIGINT := -999999;
BEGIN
    -- Validate
    v_validation := validate_purchase_update2(p_invoice_id, p_items);
    IF (v_validation->>'is_valid')::BOOLEAN = FALSE THEN
        RAISE EXCEPTION '%', v_validation->>'message';
    END IF;

    -- Update Party
    IF p_party_name IS NOT NULL THEN
        SELECT party_id INTO v_new_party_id
        FROM Parties WHERE party_name = p_party_name LIMIT 1;

        IF v_new_party_id IS NULL THEN
            RAISE EXCEPTION 'Vendor "%" not found.', p_party_name;
        END IF;

        UPDATE PurchaseInvoices
        SET vendor_id = v_new_party_id
        WHERE purchase_invoice_id = p_invoice_id;
    END IF;

    -- Update Date
    IF p_invoice_date IS NOT NULL THEN
        UPDATE PurchaseInvoices
        SET invoice_date = p_invoice_date
        WHERE purchase_invoice_id = p_invoice_id;
    END IF;

    -- Update last modifier
    IF p_created_by IS NOT NULL THEN
        UPDATE PurchaseInvoices
        SET created_by = p_created_by
        WHERE purchase_invoice_id = p_invoice_id;
    END IF;

    -- Existing serials
    SELECT ARRAY_AGG(pu.serial_number)
    INTO v_existing_serials
    FROM PurchaseUnits pu
    JOIN PurchaseItems pi ON pu.purchase_item_id = pi.purchase_item_id
    WHERE pi.purchase_invoice_id = p_invoice_id;

    IF v_existing_serials IS NULL THEN v_existing_serials := ARRAY[]::TEXT[]; END IF;

    -- New serials from JSON
    SELECT ARRAY_AGG(serial_obj->>'serial')
    INTO v_new_serials
    FROM jsonb_array_elements(p_items) AS item,
         jsonb_array_elements(item->'serials') AS serial_obj;

    IF v_new_serials IS NULL THEN v_new_serials := ARRAY[]::TEXT[]; END IF;

    -- Serials to remove
    SELECT ARRAY_AGG(s) INTO v_serials_to_remove
    FROM unnest(v_existing_serials) AS s WHERE s <> ALL(v_new_serials);
    IF v_serials_to_remove IS NULL THEN v_serials_to_remove := ARRAY[]::TEXT[]; END IF;

    -- Serials to keep
    SELECT ARRAY_AGG(s) INTO v_serials_to_keep
    FROM unnest(v_existing_serials) AS s WHERE s = ANY(v_new_serials);
    IF v_serials_to_keep IS NULL THEN v_serials_to_keep := ARRAY[]::TEXT[]; END IF;

    -- Temp item placeholder
    INSERT INTO PurchaseItems(purchase_invoice_id, item_id, quantity, unit_price)
    VALUES (p_invoice_id, 1, 1, 0)
    RETURNING purchase_item_id INTO v_temp_item_id;

    UPDATE PurchaseUnits SET purchase_item_id = v_temp_item_id
    WHERE serial_number = ANY(v_serials_to_keep);

    -- Remove old stock movements for removed serials
    DELETE FROM StockMovements
    WHERE reference_type = 'PurchaseInvoice'
      AND reference_id = p_invoice_id
      AND serial_number = ANY(v_serials_to_remove);

    -- Delete old items
    DELETE FROM PurchaseItems
    WHERE purchase_invoice_id = p_invoice_id
      AND purchase_item_id != v_temp_item_id;

    -- Recreate items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT item_id INTO v_item_id
        FROM Items WHERE item_name = (v_item->>'item_name') LIMIT 1;

        IF v_item_id IS NULL THEN
            INSERT INTO Items(item_name, sale_price)
            VALUES ((v_item->>'item_name'), (v_item->>'unit_price')::NUMERIC)
            RETURNING item_id INTO v_item_id;
        END IF;

        INSERT INTO PurchaseItems(purchase_invoice_id, item_id, quantity, unit_price)
        VALUES (p_invoice_id, v_item_id,
                (v_item->>'qty')::INT, (v_item->>'unit_price')::NUMERIC)
        RETURNING purchase_item_id INTO v_purchase_item_id;

        v_total := v_total + ((v_item->>'qty')::INT * (v_item->>'unit_price')::NUMERIC);

        FOR v_serial IN SELECT * FROM jsonb_array_elements(v_item->'serials')
        LOOP
            IF (v_serial->>'serial') = ANY(v_serials_to_keep) THEN
                UPDATE PurchaseUnits
                SET purchase_item_id = v_purchase_item_id,
                    serial_comment = NULLIF(TRIM(COALESCE(v_serial->>'comment','')), '')
                WHERE serial_number = v_serial->>'serial'
                  AND purchase_item_id = v_temp_item_id;
            ELSE
                INSERT INTO PurchaseUnits(purchase_item_id, serial_number, serial_comment, in_stock)
                VALUES (v_purchase_item_id, v_serial->>'serial',
                        NULLIF(TRIM(COALESCE(v_serial->>'comment','')), ''), TRUE);

                INSERT INTO StockMovements(item_id, serial_number, movement_type,
                                           reference_type, reference_id, quantity)
                VALUES (v_item_id, v_serial->>'serial', 'IN', 'PurchaseInvoice', p_invoice_id, 1);
            END IF;
        END LOOP;
    END LOOP;

    DELETE FROM PurchaseItems WHERE purchase_item_id = v_temp_item_id;

    UPDATE PurchaseInvoices SET total_amount = v_total
    WHERE purchase_invoice_id = p_invoice_id;

    PERFORM rebuild_purchase_journal(p_invoice_id);
END;
$$;
--
-- Name: update_purchase_items(bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION update_purchase_items(p_invoice_id bigint, p_items jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_item JSONB;
    v_item_id BIGINT;
    v_total NUMERIC(14,2) := 0;
    v_purchase_item_id BIGINT;
    v_serial TEXT;
BEGIN
    -- Remove old stock + items
    DELETE FROM StockMovements WHERE reference_type = 'PurchaseInvoice' AND reference_id = p_invoice_id;
    DELETE FROM PurchaseUnits WHERE purchase_item_id IN (SELECT purchase_item_id FROM PurchaseItems WHERE purchase_invoice_id = p_invoice_id);
    DELETE FROM PurchaseItems WHERE purchase_invoice_id = p_invoice_id;

    -- Insert new items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Resolve or create item
        SELECT item_id INTO v_item_id FROM Items WHERE item_name = (v_item->>'item_name') LIMIT 1;
        IF v_item_id IS NULL THEN
            INSERT INTO Items(item_name, sale_price)
            VALUES ((v_item->>'item_name'), (v_item->>'unit_price')::NUMERIC)
            RETURNING item_id INTO v_item_id;
        END IF;

        -- Insert purchase item
        INSERT INTO PurchaseItems(purchase_invoice_id, item_id, quantity, unit_price)
        VALUES (p_invoice_id, v_item_id, (v_item->>'qty')::INT, (v_item->>'unit_price')::NUMERIC)
        RETURNING purchase_item_id INTO v_purchase_item_id;

        -- Total
        v_total := v_total + ((v_item->>'qty')::INT * (v_item->>'unit_price')::NUMERIC);

        -- Units + Stock IN
        FOR v_serial IN SELECT jsonb_array_elements_text(v_item->'serials')
        LOOP
            INSERT INTO PurchaseUnits(purchase_item_id, serial_number, in_stock)
            VALUES (v_purchase_item_id, v_serial, TRUE);

            INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
            VALUES (v_item_id, v_serial, 'IN', 'PurchaseInvoice', p_invoice_id, 1);
        END LOOP;
    END LOOP;

    -- Update invoice total
    UPDATE PurchaseInvoices SET total_amount = v_total WHERE purchase_invoice_id = p_invoice_id;

    -- 🔑 Rebuild journal manually
    PERFORM rebuild_purchase_journal(p_invoice_id);
END;
$$;
--
-- Name: update_purchase_items(bigint, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION update_purchase_items(p_invoice_id bigint, p_items jsonb, p_party_name text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_item JSONB;
    v_item_id BIGINT;
    v_total NUMERIC(14,2) := 0;
    v_purchase_item_id BIGINT;
    v_serial TEXT;
    v_new_party_id BIGINT;
BEGIN
    -- ✅ If a new party name is provided, update vendor
    IF p_party_name IS NOT NULL THEN
        SELECT party_id INTO v_new_party_id
        FROM Parties
        WHERE party_name = p_party_name
        LIMIT 1;

        IF v_new_party_id IS NULL THEN
            RAISE EXCEPTION 'Vendor "%" not found in Parties table.', p_party_name;
        END IF;

        UPDATE PurchaseInvoices
        SET vendor_id = v_new_party_id
        WHERE purchase_invoice_id = p_invoice_id;
    END IF;

    -- Remove old stock + items
    DELETE FROM StockMovements WHERE reference_type = 'PurchaseInvoice' AND reference_id = p_invoice_id;
    DELETE FROM PurchaseUnits WHERE purchase_item_id IN (SELECT purchase_item_id FROM PurchaseItems WHERE purchase_invoice_id = p_invoice_id);
    DELETE FROM PurchaseItems WHERE purchase_invoice_id = p_invoice_id;

    -- Insert new items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Resolve or create item
        SELECT item_id INTO v_item_id FROM Items WHERE item_name = (v_item->>'item_name') LIMIT 1;
        IF v_item_id IS NULL THEN
            INSERT INTO Items(item_name, sale_price)
            VALUES ((v_item->>'item_name'), (v_item->>'unit_price')::NUMERIC)
            RETURNING item_id INTO v_item_id;
        END IF;

        -- Insert purchase item
        INSERT INTO PurchaseItems(purchase_invoice_id, item_id, quantity, unit_price)
        VALUES (p_invoice_id, v_item_id, (v_item->>'qty')::INT, (v_item->>'unit_price')::NUMERIC)
        RETURNING purchase_item_id INTO v_purchase_item_id;

        -- Total
        v_total := v_total + ((v_item->>'qty')::INT * (v_item->>'unit_price')::NUMERIC);

        -- Units + Stock IN
        FOR v_serial IN SELECT jsonb_array_elements_text(v_item->'serials')
        LOOP
            INSERT INTO PurchaseUnits(purchase_item_id, serial_number, in_stock)
            VALUES (v_purchase_item_id, v_serial, TRUE);

            INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
            VALUES (v_item_id, v_serial, 'IN', 'PurchaseInvoice', p_invoice_id, 1);
        END LOOP;
    END LOOP;

    -- Update invoice total
    UPDATE PurchaseInvoices SET total_amount = v_total WHERE purchase_invoice_id = p_invoice_id;

    -- 🔑 Rebuild journal manually (to reflect new vendor)
    PERFORM rebuild_purchase_journal(p_invoice_id);
END;
$$;
--
-- Name: update_purchase_return(bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION update_purchase_return(p_return_id bigint, p_serials jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    rec RECORD;
    v_serial TEXT;
    v_unit RECORD;
    v_total NUMERIC(14,2) := 0;
    v_vendor_id BIGINT;
BEGIN
    -- 1. Get vendor id from return header
    SELECT vendor_id INTO v_vendor_id
    FROM PurchaseReturns
    WHERE purchase_return_id = p_return_id;

    IF v_vendor_id IS NULL THEN
        RAISE EXCEPTION 'Purchase Return % not found', p_return_id;
    END IF;

    -- 2. Reverse old items (restore stock)
    FOR rec IN
        SELECT serial_number, item_id
        FROM PurchaseReturnItems
        WHERE purchase_return_id = p_return_id
    LOOP
        UPDATE PurchaseUnits
        SET in_stock = TRUE
        WHERE serial_number = rec.serial_number;

        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (rec.item_id, rec.serial_number, 'IN', 'PurchaseReturn-Update-Reverse', p_return_id, 1);
    END LOOP;

    -- 3. Remove old items
    DELETE FROM PurchaseReturnItems WHERE purchase_return_id = p_return_id;

    -- 4. Insert new items
    FOR v_serial IN SELECT jsonb_array_elements_text(p_serials)
    LOOP
        SELECT pu.unit_id, pu.serial_number, pi.item_id, pi.unit_price, p.vendor_id
        INTO v_unit
        FROM PurchaseUnits pu
        JOIN PurchaseItems pi ON pu.purchase_item_id = pi.purchase_item_id
        JOIN PurchaseInvoices p ON pi.purchase_invoice_id = p.purchase_invoice_id
        WHERE pu.serial_number = v_serial;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Serial % not found in PurchaseUnits', v_serial;
        END IF;

        -- check if in stock
        IF NOT EXISTS (
            SELECT 1 FROM PurchaseUnits WHERE unit_id = v_unit.unit_id AND in_stock = TRUE
        ) THEN
            RAISE EXCEPTION 'Serial % is not currently in stock', v_serial;
        END IF;

        -- check vendor match
        IF v_unit.vendor_id <> v_vendor_id THEN
            RAISE EXCEPTION 'Serial % was purchased from a different vendor', v_serial;
        END IF;

        -- mark as returned (out of stock)
        UPDATE PurchaseUnits 
        SET in_stock = FALSE 
        WHERE unit_id = v_unit.unit_id;

        -- log stock OUT
        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (v_unit.item_id, v_serial, 'OUT', 'PurchaseReturn-Update', p_return_id, 1);

        -- insert return line (✅ unit_price instead of cost_price)
        INSERT INTO PurchaseReturnItems(purchase_return_id, item_id, unit_price, serial_number)
        VALUES (p_return_id, v_unit.item_id, v_unit.unit_price, v_serial);

        v_total := v_total + v_unit.unit_price;
    END LOOP;

    -- 5. Update header total
    UPDATE PurchaseReturns
    SET total_amount = v_total
    WHERE purchase_return_id = p_return_id;

    -- 6. Rebuild journal
    PERFORM rebuild_purchase_return_journal(p_return_id);
END;
$$;
--
-- Name: update_purchase_return(bigint, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION update_purchase_return(p_return_id bigint, p_serials jsonb, p_created_by integer DEFAULT NULL::integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    rec         RECORD;
    v_serial    TEXT;
    v_unit      RECORD;
    v_total     NUMERIC(14,2) := 0;
    v_vendor_id BIGINT;
BEGIN
    -- Get vendor id
    SELECT vendor_id INTO v_vendor_id
    FROM PurchaseReturns WHERE purchase_return_id = p_return_id;

    IF v_vendor_id IS NULL THEN
        RAISE EXCEPTION 'Purchase Return % not found', p_return_id;
    END IF;

    -- Reverse old items (restore stock)
    FOR rec IN
        SELECT serial_number, item_id
        FROM PurchaseReturnItems
        WHERE purchase_return_id = p_return_id
    LOOP
        UPDATE PurchaseUnits SET in_stock = TRUE
        WHERE serial_number = rec.serial_number;

        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (rec.item_id, rec.serial_number, 'IN', 'PurchaseReturn-Update-Reverse', p_return_id, 1);
    END LOOP;

    -- Remove old items
    DELETE FROM PurchaseReturnItems WHERE purchase_return_id = p_return_id;

    -- Insert new items
    FOR v_serial IN SELECT jsonb_array_elements_text(p_serials)
    LOOP
        SELECT pu.unit_id, pu.serial_number, pi.item_id, pi.unit_price, p.vendor_id
        INTO v_unit
        FROM PurchaseUnits pu
        JOIN PurchaseItems pi     ON pu.purchase_item_id = pi.purchase_item_id
        JOIN PurchaseInvoices p   ON pi.purchase_invoice_id = p.purchase_invoice_id
        WHERE pu.serial_number = v_serial;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Serial % not found in PurchaseUnits', v_serial;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM PurchaseUnits WHERE unit_id = v_unit.unit_id AND in_stock = TRUE
        ) THEN
            RAISE EXCEPTION 'Serial % is not currently in stock', v_serial;
        END IF;

        UPDATE PurchaseUnits SET in_stock = FALSE WHERE unit_id = v_unit.unit_id;

        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (v_unit.item_id, v_serial, 'OUT', 'PurchaseReturn-Update', p_return_id, 1);

        INSERT INTO PurchaseReturnItems(purchase_return_id, item_id, unit_price, serial_number)
        VALUES (p_return_id, v_unit.item_id, v_unit.unit_price, v_serial);

        v_total := v_total + v_unit.unit_price;
    END LOOP;

    -- Update totals and last modifier
    UPDATE PurchaseReturns
    SET total_amount = v_total,
        created_by   = COALESCE(p_created_by, created_by)   -- NEW
    WHERE purchase_return_id = p_return_id;

    PERFORM rebuild_purchase_return_journal(p_return_id);
END;
$$;
--
-- Name: update_receipt(bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION update_receipt(p_receipt_id bigint, p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_amount     NUMERIC(14,4);
    v_method     TEXT;
    v_reference  TEXT;
    v_desc       TEXT;
    v_date       DATE;
    v_party_id   BIGINT;
    v_created_by INTEGER;
    v_updated    RECORD;
BEGIN
    v_amount     := NULLIF(p_data->>'amount','')::NUMERIC;
    v_method     := NULLIF(p_data->>'method','');
    v_reference  := NULLIF(p_data->>'reference_no','');
    v_desc       := NULLIF(p_data->>'description','');
    v_date       := NULLIF(p_data->>'receipt_date','')::DATE;
    v_created_by := NULLIF(p_data->>'created_by_id','')::INTEGER;

    IF p_data ? 'party_name' THEN
        SELECT party_id INTO v_party_id
        FROM Parties
        WHERE party_name = p_data->>'party_name'
        LIMIT 1;
        IF v_party_id IS NULL THEN
            RAISE EXCEPTION 'Customer % not found', p_data->>'party_name';
        END IF;
    END IF;

    IF v_amount IS NOT NULL AND v_amount <= 0 THEN
        RAISE EXCEPTION 'Invalid amount';
    END IF;

    UPDATE Receipts
    SET amount       = COALESCE(v_amount,     amount),
        method       = COALESCE(v_method,     method),
        reference_no = COALESCE(v_reference,  reference_no),
        party_id     = COALESCE(v_party_id,   party_id),
        description  = COALESCE(v_desc,       description),
        receipt_date = COALESCE(v_date,       receipt_date),
        created_by   = COALESCE(v_created_by, created_by)   -- NEW
    WHERE receipt_id = p_receipt_id
    RETURNING * INTO v_updated;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Receipt ID % not found', p_receipt_id;
    END IF;

    RETURN jsonb_build_object(
        'status',  'success',
        'message', 'Receipt updated successfully',
        'receipt', to_jsonb(v_updated)
    );
END;
$$;
--
-- Name: update_sale_invoice(bigint, jsonb, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION update_sale_invoice(p_invoice_id bigint, p_items jsonb, p_party_name text DEFAULT NULL::text, p_invoice_date date DEFAULT NULL::date) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_item JSONB;
    v_item_id BIGINT;
    v_total NUMERIC(14,2) := 0;
    v_sales_item_id BIGINT;
    v_serial TEXT;
    v_unit_id BIGINT;
    v_new_party_id BIGINT;
BEGIN
    -- ========================================================
    -- 1️⃣ Update Party (Customer) if given
    -- ========================================================
    IF p_party_name IS NOT NULL THEN
        SELECT party_id INTO v_new_party_id
        FROM Parties
        WHERE party_name = p_party_name
        LIMIT 1;

        IF v_new_party_id IS NULL THEN
            RAISE EXCEPTION 'Customer "%" not found in Parties table.', p_party_name;
        END IF;

        UPDATE SalesInvoices
        SET customer_id = v_new_party_id
        WHERE sales_invoice_id = p_invoice_id;
    END IF;

    -- ========================================================
    -- 2️⃣ Update Invoice Date (if provided)
    -- ========================================================
    IF p_invoice_date IS NOT NULL THEN
        UPDATE SalesInvoices
        SET invoice_date = p_invoice_date
        WHERE sales_invoice_id = p_invoice_id;
    END IF;

    -- ========================================================
    -- 3️⃣ Delete old items + sold units + stock movements
    -- ========================================================
    DELETE FROM StockMovements 
    WHERE reference_type = 'SalesInvoice' AND reference_id = p_invoice_id;

    DELETE FROM SoldUnits
    WHERE sales_item_id IN (
        SELECT sales_item_id FROM SalesItems WHERE sales_invoice_id = p_invoice_id
    );

    DELETE FROM SalesItems 
    WHERE sales_invoice_id = p_invoice_id;

    -- ========================================================
    -- 4️⃣ Insert new/updated items and serials
    -- ========================================================
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Find item_id
        SELECT item_id INTO v_item_id
        FROM Items
        WHERE item_name = (v_item->>'item_name')
        LIMIT 1;

        IF v_item_id IS NULL THEN
            RAISE EXCEPTION 'Item "%" not found in Items table for update_sale_invoice', (v_item->>'item_name');
        END IF;

        -- Insert sales item
        INSERT INTO SalesItems(sales_invoice_id, item_id, quantity, unit_price)
        VALUES (
            p_invoice_id,
            v_item_id,
            (v_item->>'qty')::INT,
            (v_item->>'unit_price')::NUMERIC
        )
        RETURNING sales_item_id INTO v_sales_item_id;

        -- Add to total
        v_total := v_total + ((v_item->>'qty')::INT * (v_item->>'unit_price')::NUMERIC);

        -- Insert sold units + stock movements
        FOR v_serial IN SELECT jsonb_array_elements_text(v_item->'serials')
        LOOP
            -- get matching purchase unit
            SELECT unit_id INTO v_unit_id
            FROM PurchaseUnits
            WHERE serial_number = v_serial
            LIMIT 1;

            IF v_unit_id IS NULL THEN
                RAISE EXCEPTION 'Serial % not found in PurchaseUnits', v_serial;
            END IF;

            -- mark unit as sold (in_stock = FALSE)
            UPDATE PurchaseUnits
            SET in_stock = FALSE
            WHERE unit_id = v_unit_id;

            -- insert into SoldUnits
            INSERT INTO SoldUnits(sales_item_id, unit_id, sold_price, status)
            VALUES (v_sales_item_id, v_unit_id, (v_item->>'unit_price')::NUMERIC, 'Sold');

            -- log stock OUT
            INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
            VALUES (v_item_id, v_serial, 'OUT', 'SalesInvoice', p_invoice_id, 1);
        END LOOP;
    END LOOP;

    -- ========================================================
    -- 5️⃣ Update total amount
    -- ========================================================
    UPDATE SalesInvoices
    SET total_amount = v_total
    WHERE sales_invoice_id = p_invoice_id;

    -- ========================================================
    -- 6️⃣ Rebuild journal (refreshes AR, Revenue, COGS, Inventory)
    -- ========================================================
    PERFORM rebuild_sales_journal(p_invoice_id);

END;
$$;
--
-- Name: update_sale_invoice(bigint, jsonb, text, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION update_sale_invoice(p_invoice_id bigint, p_items jsonb, p_party_name text DEFAULT NULL::text, p_invoice_date date DEFAULT NULL::date, p_created_by integer DEFAULT NULL::integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_item          JSONB;
    v_item_id       BIGINT;
    v_total         NUMERIC(14,2) := 0;
    v_sales_item_id BIGINT;
    v_serial        TEXT;
    v_unit_id       BIGINT;
    v_new_party_id  BIGINT;
BEGIN
    -- 1. Update Party (Customer) if given
    IF p_party_name IS NOT NULL THEN
        SELECT party_id INTO v_new_party_id
        FROM Parties WHERE party_name = p_party_name LIMIT 1;

        IF v_new_party_id IS NULL THEN
            RAISE EXCEPTION 'Customer "%" not found in Parties table.', p_party_name;
        END IF;

        UPDATE SalesInvoices
        SET customer_id = v_new_party_id
        WHERE sales_invoice_id = p_invoice_id;
    END IF;

    -- 2. Update Invoice Date (if provided)
    IF p_invoice_date IS NOT NULL THEN
        UPDATE SalesInvoices
        SET invoice_date = p_invoice_date
        WHERE sales_invoice_id = p_invoice_id;
    END IF;

    -- 3. Update last modifier (always, if provided)
    IF p_created_by IS NOT NULL THEN
        UPDATE SalesInvoices
        SET created_by = p_created_by
        WHERE sales_invoice_id = p_invoice_id;
    END IF;

    -- 4. Delete old items + sold units + stock movements
    DELETE FROM StockMovements
    WHERE reference_type = 'SalesInvoice' AND reference_id = p_invoice_id;

    DELETE FROM SoldUnits
    WHERE sales_item_id IN (
        SELECT sales_item_id FROM SalesItems WHERE sales_invoice_id = p_invoice_id
    );

    DELETE FROM SalesItems WHERE sales_invoice_id = p_invoice_id;

    -- 5. Insert new/updated items and serials
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT item_id INTO v_item_id
        FROM Items WHERE item_name = (v_item->>'item_name') LIMIT 1;

        IF v_item_id IS NULL THEN
            RAISE EXCEPTION 'Item "%" not found in Items table for update_sale_invoice',
                            (v_item->>'item_name');
        END IF;

        INSERT INTO SalesItems(sales_invoice_id, item_id, quantity, unit_price)
        VALUES (p_invoice_id, v_item_id,
                (v_item->>'qty')::INT, (v_item->>'unit_price')::NUMERIC)
        RETURNING sales_item_id INTO v_sales_item_id;

        v_total := v_total + ((v_item->>'qty')::INT * (v_item->>'unit_price')::NUMERIC);

        FOR v_serial IN SELECT jsonb_array_elements_text(v_item->'serials')
        LOOP
            SELECT unit_id INTO v_unit_id
            FROM PurchaseUnits WHERE serial_number = v_serial LIMIT 1;

            IF v_unit_id IS NULL THEN
                RAISE EXCEPTION 'Serial % not found in PurchaseUnits', v_serial;
            END IF;

            UPDATE PurchaseUnits SET in_stock = FALSE WHERE unit_id = v_unit_id;

            INSERT INTO SoldUnits(sales_item_id, unit_id, sold_price, status)
            VALUES (v_sales_item_id, v_unit_id, (v_item->>'unit_price')::NUMERIC, 'Sold');

            INSERT INTO StockMovements(item_id, serial_number, movement_type,
                                       reference_type, reference_id, quantity)
            VALUES (v_item_id, v_serial, 'OUT', 'SalesInvoice', p_invoice_id, 1);
        END LOOP;
    END LOOP;

    -- 6. Update total amount
    UPDATE SalesInvoices SET total_amount = v_total
    WHERE sales_invoice_id = p_invoice_id;

    -- 7. Rebuild journal
    PERFORM rebuild_sales_journal(p_invoice_id);
END;
$$;
--
-- Name: update_sale_return(bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION update_sale_return(p_return_id bigint, p_serials jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    rec RECORD;
    v_serial TEXT;
    v_unit RECORD;
    v_total NUMERIC(14,2) := 0;
    v_cost NUMERIC(14,2) := 0;
    v_customer_id BIGINT;
BEGIN
    FOR rec IN
        SELECT serial_number, item_id
        FROM SalesReturnItems
        WHERE sales_return_id = p_return_id
    LOOP
        UPDATE SoldUnits
        SET status = 'Sold'
        WHERE unit_id = (
            SELECT unit_id FROM PurchaseUnits WHERE serial_number = rec.serial_number LIMIT 1
        );

        UPDATE PurchaseUnits
        SET in_stock = FALSE
        WHERE serial_number = rec.serial_number;

        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (rec.item_id, rec.serial_number, 'OUT', 'SalesReturn-Update-Reverse', p_return_id, 1);
    END LOOP;

    DELETE FROM SalesReturnItems WHERE sales_return_id = p_return_id;

    SELECT customer_id INTO v_customer_id
    FROM SalesReturns
    WHERE sales_return_id = p_return_id;

    FOR v_serial IN SELECT jsonb_array_elements_text(p_serials)
    LOOP
        SELECT su.sold_unit_id, su.unit_id, su.sold_price, si.item_id,
               si.sales_invoice_id, pu.serial_number, pi.unit_price, s.customer_id
        INTO v_unit
        FROM SoldUnits su
        JOIN SalesItems si ON su.sales_item_id = si.sales_item_id
        JOIN SalesInvoices s ON si.sales_invoice_id = s.sales_invoice_id
        JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
        JOIN PurchaseItems pi ON pu.purchase_item_id = pi.purchase_item_id
        WHERE pu.serial_number = v_serial
          AND su.status = 'Sold';  -- only fetch the active sold record

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Serial % not found in SoldUnits or is not currently in Sold status', v_serial;
        END IF;

        IF v_unit.customer_id <> v_customer_id THEN
            RAISE EXCEPTION 'Serial % was not sold to this customer', v_serial;
        END IF;

        UPDATE SoldUnits SET status = 'Returned' WHERE sold_unit_id = v_unit.sold_unit_id;
        UPDATE PurchaseUnits SET in_stock = TRUE WHERE unit_id = v_unit.unit_id;

        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (v_unit.item_id, v_serial, 'IN', 'SalesReturn-Update', p_return_id, 1);

        INSERT INTO SalesReturnItems(sales_return_id, item_id, sold_price, cost_price, serial_number)
        VALUES (p_return_id, v_unit.item_id, v_unit.sold_price, v_unit.unit_price, v_serial);

        v_total := v_total + v_unit.sold_price;
        v_cost := v_cost + v_unit.unit_price;
    END LOOP;

    UPDATE SalesReturns
    SET total_amount = v_total
    WHERE sales_return_id = p_return_id;

    PERFORM rebuild_sales_return_journal(p_return_id);
END;
$$;
--
-- Name: update_sale_return(bigint, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION update_sale_return(p_return_id bigint, p_serials jsonb, p_created_by integer DEFAULT NULL::integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    rec           RECORD;
    v_serial      TEXT;
    v_unit        RECORD;
    v_total       NUMERIC(14,2) := 0;
    v_cost        NUMERIC(14,2) := 0;
    v_customer_id BIGINT;
BEGIN
    -- Reverse old items
    FOR rec IN
        SELECT serial_number, item_id
        FROM SalesReturnItems
        WHERE sales_return_id = p_return_id
    LOOP
        UPDATE SoldUnits
        SET status = 'Sold'
        WHERE unit_id = (
            SELECT unit_id FROM PurchaseUnits
            WHERE serial_number = rec.serial_number LIMIT 1
        );

        UPDATE PurchaseUnits
        SET in_stock = FALSE
        WHERE serial_number = rec.serial_number;

        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (rec.item_id, rec.serial_number, 'OUT', 'SalesReturn-Update-Reverse', p_return_id, 1);
    END LOOP;

    DELETE FROM SalesReturnItems WHERE sales_return_id = p_return_id;

    SELECT customer_id INTO v_customer_id
    FROM SalesReturns WHERE sales_return_id = p_return_id;

    -- Insert new items
    FOR v_serial IN SELECT jsonb_array_elements_text(p_serials)
    LOOP
        SELECT su.sold_unit_id, su.unit_id, su.sold_price, si.item_id,
               si.sales_invoice_id, pu.serial_number, pi.unit_price, s.customer_id
        INTO v_unit
        FROM SoldUnits su
        JOIN SalesItems si    ON su.sales_item_id = si.sales_item_id
        JOIN SalesInvoices s  ON si.sales_invoice_id = s.sales_invoice_id
        JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
        JOIN PurchaseItems pi ON pu.purchase_item_id = pi.purchase_item_id
        WHERE pu.serial_number = v_serial
          AND su.status = 'Sold';

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Serial % not found in SoldUnits or is not currently in Sold status', v_serial;
        END IF;

        IF v_unit.customer_id <> v_customer_id THEN
            RAISE EXCEPTION 'Serial % was not sold to this customer', v_serial;
        END IF;

        UPDATE SoldUnits SET status = 'Returned' WHERE sold_unit_id = v_unit.sold_unit_id;
        UPDATE PurchaseUnits SET in_stock = TRUE WHERE unit_id = v_unit.unit_id;

        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (v_unit.item_id, v_serial, 'IN', 'SalesReturn-Update', p_return_id, 1);

        INSERT INTO SalesReturnItems(sales_return_id, item_id, sold_price, cost_price, serial_number)
        VALUES (p_return_id, v_unit.item_id, v_unit.sold_price, v_unit.unit_price, v_serial);

        v_total := v_total + v_unit.sold_price;
        v_cost  := v_cost  + v_unit.unit_price;
    END LOOP;

    -- Update totals and last modifier
    UPDATE SalesReturns
    SET total_amount = v_total,
        created_by   = COALESCE(p_created_by, created_by)   -- NEW
    WHERE sales_return_id = p_return_id;

    PERFORM rebuild_sales_return_journal(p_return_id);
END;
$$;
--
-- Name: validate_purchase_delete(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION validate_purchase_delete(p_invoice_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_invoice_serials TEXT[];
    v_sold_serials TEXT[];
    v_returned_serials TEXT[];
    v_message TEXT;
BEGIN
    -- 1️⃣ Get all serial numbers from this purchase invoice
    SELECT ARRAY_AGG(pu.serial_number)
    INTO v_invoice_serials
    FROM PurchaseUnits pu
    JOIN PurchaseItems pi ON pu.purchase_item_id = pi.purchase_item_id
    WHERE pi.purchase_invoice_id = p_invoice_id;

    IF v_invoice_serials IS NULL THEN
        v_invoice_serials := ARRAY[]::TEXT[];
    END IF;

    -- 2️⃣ Check if any of these serials are sold
    SELECT ARRAY_AGG(pu.serial_number)
    INTO v_sold_serials
    FROM SoldUnits su
    JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
    WHERE pu.serial_number = ANY(v_invoice_serials);

    IF v_sold_serials IS NULL THEN
        v_sold_serials := ARRAY[]::TEXT[];
    END IF;

    -- 3️⃣ Check if any of these serials are already returned to vendor
    SELECT ARRAY_AGG(pri.serial_number)
    INTO v_returned_serials
    FROM PurchaseReturnItems pri
    WHERE pri.serial_number = ANY(v_invoice_serials);

    IF v_returned_serials IS NULL THEN
        v_returned_serials := ARRAY[]::TEXT[];
    END IF;

    -- 4️⃣ If any sold or returned serials exist, prevent deletion
    IF array_length(v_sold_serials, 1) IS NOT NULL
       OR array_length(v_returned_serials, 1) IS NOT NULL THEN

        v_message := '❌ Purchase Invoice ' || p_invoice_id || ' cannot be deleted.';

        IF array_length(v_sold_serials, 1) IS NOT NULL THEN
            v_message := v_message || ' ' || array_length(v_sold_serials, 1) || ' sold serial(s) found.';
        END IF;

        IF array_length(v_returned_serials, 1) IS NOT NULL THEN
            v_message := v_message || ' ' || array_length(v_returned_serials, 1) || ' returned serial(s) found.';
        END IF;

        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'message', v_message,
            'sold_serials', v_sold_serials,
            'returned_serials', v_returned_serials
        );
    END IF;

    -- 5️⃣ Otherwise, safe to delete
    RETURN jsonb_build_object(
        'is_valid', TRUE,
        'message', '✅ Safe to delete — no sold or returned serials found in this invoice.',
        'sold_serials', v_sold_serials,
        'returned_serials', v_returned_serials
    );
END;
$$;
--
-- Name: validate_purchase_update(bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION validate_purchase_update(p_invoice_id bigint, p_items jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_existing_serials TEXT[];
    v_new_serials TEXT[];
    v_removed_serials TEXT[];
    v_sold_serials TEXT[];
    v_returned_serials TEXT[];
    v_message TEXT;
BEGIN
    -- 1️⃣ Get all serials currently in this purchase invoice
    SELECT ARRAY_AGG(pu.serial_number)
    INTO v_existing_serials
    FROM PurchaseUnits pu
    JOIN PurchaseItems pi ON pu.purchase_item_id = pi.purchase_item_id
    WHERE pi.purchase_invoice_id = p_invoice_id;

    IF v_existing_serials IS NULL THEN
        v_existing_serials := ARRAY[]::TEXT[];
    END IF;

    -- 2️⃣ Extract all serials from the new JSON data (flatten correctly)
    SELECT ARRAY_AGG(serial::TEXT)
    INTO v_new_serials
    FROM jsonb_array_elements(p_items) AS item,
         jsonb_array_elements_text(item->'serials') AS serial;

    IF v_new_serials IS NULL THEN
        v_new_serials := ARRAY[]::TEXT[];
    END IF;

    -- 3️⃣ Find removed serials (those that existed before but not now)
    SELECT ARRAY_AGG(s)
    INTO v_removed_serials
    FROM unnest(v_existing_serials) AS s
    WHERE s <> ALL(v_new_serials);

    IF v_removed_serials IS NULL THEN
        v_removed_serials := ARRAY[]::TEXT[];
    END IF;

    -- 4️⃣ Check if removed serials are sold
    SELECT ARRAY_AGG(pu.serial_number)
    INTO v_sold_serials
    FROM SoldUnits su
    JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
    WHERE pu.serial_number = ANY(v_removed_serials);

    IF v_sold_serials IS NULL THEN
        v_sold_serials := ARRAY[]::TEXT[];
    END IF;

    -- 5️⃣ Check if removed serials are already returned to vendor
    SELECT ARRAY_AGG(pri.serial_number)
    INTO v_returned_serials
    FROM PurchaseReturnItems pri
    WHERE pri.serial_number = ANY(v_removed_serials);

    IF v_returned_serials IS NULL THEN
        v_returned_serials := ARRAY[]::TEXT[];
    END IF;

    -- 6️⃣ If any conflicts found, return descriptive message
    IF array_length(v_sold_serials, 1) IS NOT NULL
       OR array_length(v_returned_serials, 1) IS NOT NULL THEN

        v_message := '❌ Some serials cannot be removed.';

        IF array_length(v_sold_serials, 1) IS NOT NULL THEN
            v_message := v_message || ' ' || array_length(v_sold_serials, 1) || ' sold serial(s) found.';
        END IF;

        IF array_length(v_returned_serials, 1) IS NOT NULL THEN
            v_message := v_message || ' ' || array_length(v_returned_serials, 1) || ' returned serial(s) found.';
        END IF;

        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'message', v_message,
            'sold_serials', v_sold_serials,
            'returned_serials', v_returned_serials
        );
    END IF;

    -- 7️⃣ Otherwise, all safe
    RETURN jsonb_build_object(
        'is_valid', TRUE,
        'message', '✅ Safe to update — no sold or returned serials will be removed.',
        'sold_serials', v_sold_serials,
        'returned_serials', v_returned_serials
    );
END;
$$;
--
-- Name: validate_purchase_update2(bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION validate_purchase_update2(p_invoice_id bigint, p_items jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_existing_serials TEXT[];
    v_new_serials TEXT[];
    v_removed_serials TEXT[];
    v_sold_serials TEXT[];
    v_returned_serials TEXT[];
    v_message TEXT;
BEGIN
    -- 1️⃣ Existing serials in invoice
    SELECT ARRAY_AGG(pu.serial_number)
    INTO v_existing_serials
    FROM PurchaseUnits pu
    JOIN PurchaseItems pi ON pu.purchase_item_id = pi.purchase_item_id
    WHERE pi.purchase_invoice_id = p_invoice_id;

    IF v_existing_serials IS NULL THEN
        v_existing_serials := ARRAY[]::TEXT[];
    END IF;

    -- 2️⃣ Extract serials from NEW JSON (object format)
    SELECT ARRAY_AGG(serial_obj->>'serial')
    INTO v_new_serials
    FROM jsonb_array_elements(p_items) AS item,
         jsonb_array_elements(item->'serials') AS serial_obj;

    IF v_new_serials IS NULL THEN
        v_new_serials := ARRAY[]::TEXT[];
    END IF;

    -- 3️⃣ Identify removed serials
    SELECT ARRAY_AGG(s)
    INTO v_removed_serials
    FROM unnest(v_existing_serials) AS s
    WHERE s <> ALL(v_new_serials);

    IF v_removed_serials IS NULL THEN
        v_removed_serials := ARRAY[]::TEXT[];
    END IF;

    -- 4️⃣ Check SOLD serials
    SELECT ARRAY_AGG(pu.serial_number)
    INTO v_sold_serials
    FROM SoldUnits su
    JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
    WHERE pu.serial_number = ANY(v_removed_serials);

    IF v_sold_serials IS NULL THEN
        v_sold_serials := ARRAY[]::TEXT[];
    END IF;

    -- 5️⃣ Check RETURNED serials
    SELECT ARRAY_AGG(pri.serial_number)
    INTO v_returned_serials
    FROM PurchaseReturnItems pri
    WHERE pri.serial_number = ANY(v_removed_serials);

    IF v_returned_serials IS NULL THEN
        v_returned_serials := ARRAY[]::TEXT[];
    END IF;

    -- 6️⃣ Conflict check
    IF array_length(v_sold_serials, 1) IS NOT NULL 
       OR array_length(v_returned_serials, 1) IS NOT NULL THEN
        
        v_message := '❌ Cannot update Purchase Invoice ' || p_invoice_id || '.';
        
        IF array_length(v_sold_serials, 1) IS NOT NULL THEN
            v_message := v_message || ' ' || array_length(v_sold_serials, 1) || 
                        ' serial(s) already sold cannot be removed.';
        END IF;
        
        IF array_length(v_returned_serials, 1) IS NOT NULL THEN
            v_message := v_message || ' ' || array_length(v_returned_serials, 1) || 
                        ' serial(s) already returned cannot be removed.';
        END IF;

        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'message', v_message,
            'sold_serials', v_sold_serials,
            'returned_serials', v_returned_serials,
            'removed_serials', v_removed_serials
        );
    END IF;

    -- 7️⃣ Safe
    RETURN jsonb_build_object(
        'is_valid', TRUE,
        'message', '✅ Safe to update — no sold or returned serials will be removed.',
        'sold_serials', v_sold_serials,
        'returned_serials', v_returned_serials,
        'removed_serials', v_removed_serials
    );
END;
$$;
--
-- Name: validate_sales_delete(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION validate_sales_delete(p_invoice_id bigint) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_invoice_serials TEXT[];
    v_returned_serials TEXT[];
    v_message TEXT;
BEGIN
    -- 1️⃣ Get all serials belonging to this Sales Invoice
    SELECT ARRAY_AGG(pu.serial_number)
    INTO v_invoice_serials
    FROM SoldUnits su
    JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
    JOIN SalesItems si ON su.sales_item_id = si.sales_item_id
    WHERE si.sales_invoice_id = p_invoice_id;

    IF v_invoice_serials IS NULL THEN
        v_invoice_serials := ARRAY[]::TEXT[];
    END IF;

    -- 2️⃣ Check which of these serials are already returned
    SELECT ARRAY_AGG(sri.serial_number)
    INTO v_returned_serials
    FROM SalesReturnItems sri
    WHERE sri.serial_number = ANY(v_invoice_serials);

    IF v_returned_serials IS NULL THEN
        v_returned_serials := ARRAY[]::TEXT[];
    END IF;

    -- 3️⃣ If any serials are returned, block deletion
    IF array_length(v_returned_serials, 1) IS NOT NULL THEN
        v_message := '❌ Cannot delete Sales Invoice ' || p_invoice_id ||
                     ' — ' || array_length(v_returned_serials, 1) ||
                     ' serial(s) already returned.';

        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'message', v_message,
            'returned_serials', v_returned_serials
        );
    END IF;

    -- 4️⃣ Otherwise, safe to delete
    RETURN jsonb_build_object(
        'is_valid', TRUE,
        'message', '✅ Safe to delete — no returned serials found.',
        'returned_serials', v_returned_serials
    );
END;
$$;
--
-- Name: validate_sales_update(bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION validate_sales_update(p_invoice_id bigint, p_items jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_existing_serials TEXT[];
    v_new_serials TEXT[];
    v_removed_serials TEXT[];
    v_returned_serials TEXT[];
    v_message TEXT;
BEGIN
    -- 1️⃣ Get all serials currently in this sales invoice
    SELECT ARRAY_AGG(pu.serial_number)
    INTO v_existing_serials
    FROM SoldUnits su
    JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
    JOIN SalesItems si ON su.sales_item_id = si.sales_item_id
    WHERE si.sales_invoice_id = p_invoice_id;

    IF v_existing_serials IS NULL THEN
        v_existing_serials := ARRAY[]::TEXT[];
    END IF;

    -- 2️⃣ Extract all serials from the new JSON data (flatten correctly)
    SELECT ARRAY_AGG(serial::TEXT)
    INTO v_new_serials
    FROM jsonb_array_elements(p_items) AS item,
         jsonb_array_elements_text(item->'serials') AS serial;

    IF v_new_serials IS NULL THEN
        v_new_serials := ARRAY[]::TEXT[];
    END IF;

    -- 3️⃣ Find removed serials (those that existed before but not now)
    SELECT ARRAY_AGG(s)
    INTO v_removed_serials
    FROM unnest(v_existing_serials) AS s
    WHERE s <> ALL(v_new_serials);

    IF v_removed_serials IS NULL THEN
        v_removed_serials := ARRAY[]::TEXT[];
    END IF;

    -- 4️⃣ Check if removed serials are already in Sales Return
    SELECT ARRAY_AGG(sri.serial_number)
    INTO v_returned_serials
    FROM SalesReturnItems sri
    WHERE sri.serial_number = ANY(v_removed_serials);

    IF v_returned_serials IS NULL THEN
        v_returned_serials := ARRAY[]::TEXT[];
    END IF;

    -- 5️⃣ If any conflicts found, return descriptive message
    IF array_length(v_returned_serials, 1) IS NOT NULL THEN
        v_message := '❌ Some serials cannot be removed. ' ||
                     array_length(v_returned_serials, 1) || ' serial(s) already returned.';

        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'message', v_message,
            'returned_serials', v_returned_serials
        );
    END IF;

    -- 6️⃣ Otherwise, all safe
    RETURN jsonb_build_object(
        'is_valid', TRUE,
        'message', '✅ Safe to update — no returned serials will be removed.',
        'returned_serials', v_returned_serials
    );
END;
$$;
--
-- Name: chartofaccounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE chartofaccounts (
    account_id bigint NOT NULL,
    account_code character varying(20) NOT NULL,
    account_name character varying(150) NOT NULL,
    account_type character varying(20) NOT NULL,
    parent_account bigint,
    date_created timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chartofaccounts_account_type_check CHECK (((account_type)::text = ANY (ARRAY[('Asset'::character varying)::text, ('Liability'::character varying)::text, ('Equity'::character varying)::text, ('Revenue'::character varying)::text, ('Expense'::character varying)::text])))
);
--
-- Name: chartofaccounts_account_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE chartofaccounts_account_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: chartofaccounts_account_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE chartofaccounts_account_id_seq OWNED BY chartofaccounts.account_id;
--
-- Name: journalentries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE journalentries (
    journal_id bigint NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    description text,
    date_created timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: journallines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE journallines (
    line_id bigint NOT NULL,
    journal_id bigint NOT NULL,
    account_id bigint NOT NULL,
    party_id bigint,
    debit numeric(14,2) DEFAULT 0,
    credit numeric(14,2) DEFAULT 0,
    CONSTRAINT journallines_check CHECK (((debit >= (0)::numeric) AND (credit >= (0)::numeric))),
    CONSTRAINT journallines_check1 CHECK ((NOT ((debit = (0)::numeric) AND (credit = (0)::numeric))))
);
--
-- Name: generalledger; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW generalledger AS
 SELECT jl.line_id AS gl_entry_id,
    je.journal_id,
    je.entry_date,
    jl.account_id,
    jl.party_id,
    jl.debit,
    jl.credit,
    je.description
   FROM (journallines jl
     JOIN journalentries je ON ((jl.journal_id = je.journal_id)));
--
-- Name: items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE items (
    item_id bigint NOT NULL,
    item_name character varying(150) NOT NULL,
    storage character varying(100),
    sale_price numeric(12,2) DEFAULT 0.00 NOT NULL,
    item_code character varying(50),
    category character varying(100),
    brand character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer
);
--
-- Name: parties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE parties (
    party_id bigint NOT NULL,
    party_name character varying(150) NOT NULL,
    party_type character varying(20) NOT NULL,
    contact_info character varying(50),
    address text,
    ar_account_id bigint,
    ap_account_id bigint,
    opening_balance numeric(14,2) DEFAULT 0,
    balance_type character varying(10) DEFAULT 'Debit'::character varying,
    date_created timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer,
    CONSTRAINT parties_balance_type_check CHECK (((balance_type)::text = ANY (ARRAY[('Debit'::character varying)::text, ('Credit'::character varying)::text]))),
    CONSTRAINT parties_party_type_check CHECK (((party_type)::text = ANY (ARRAY[('Customer'::character varying)::text, ('Vendor'::character varying)::text, ('Both'::character varying)::text, ('Expense'::character varying)::text])))
);
--
-- Name: purchaseinvoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE purchaseinvoices (
    purchase_invoice_id bigint NOT NULL,
    vendor_id bigint NOT NULL,
    invoice_date date DEFAULT CURRENT_DATE NOT NULL,
    total_amount numeric(14,2) NOT NULL,
    journal_id bigint,
    created_by integer
);
--
-- Name: purchaseitems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE purchaseitems (
    purchase_item_id bigint NOT NULL,
    purchase_invoice_id bigint NOT NULL,
    item_id bigint NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    CONSTRAINT purchaseitems_quantity_check CHECK ((quantity > 0))
);
--
-- Name: purchaseunits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE purchaseunits (
    unit_id bigint NOT NULL,
    purchase_item_id bigint NOT NULL,
    serial_number character varying(100) NOT NULL,
    in_stock boolean DEFAULT true,
    serial_comment text
);
--
-- Name: COLUMN purchaseunits.serial_comment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN purchaseunits.serial_comment IS 'Optional comment for this serial number (informational only, does not affect accounting, inventory valuation, or ledger postings)';
--
-- Name: salesinvoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE salesinvoices (
    sales_invoice_id bigint NOT NULL,
    customer_id bigint NOT NULL,
    invoice_date date DEFAULT CURRENT_DATE NOT NULL,
    total_amount numeric(14,2) NOT NULL,
    journal_id bigint,
    created_by integer
);
--
-- Name: salesitems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE salesitems (
    sales_item_id bigint NOT NULL,
    sales_invoice_id bigint NOT NULL,
    item_id bigint NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    CONSTRAINT salesitems_quantity_check CHECK ((quantity > 0))
);
--
-- Name: soldunits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE soldunits (
    sold_unit_id bigint NOT NULL,
    sales_item_id bigint NOT NULL,
    unit_id bigint NOT NULL,
    sold_price numeric(12,2) NOT NULL,
    status character varying(20) DEFAULT 'Sold'::character varying,
    CONSTRAINT soldunits_status_check CHECK (((status)::text = ANY (ARRAY[('Sold'::character varying)::text, ('Returned'::character varying)::text, ('Damaged'::character varying)::text])))
);
--
-- Name: item_history_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW item_history_view AS
 WITH purchase_history AS (
         SELECT i.item_id,
            i.item_name,
            pu.serial_number,
            p.invoice_date AS transaction_date,
            'PURCHASE'::text AS transaction_type,
            v.party_name AS counterparty,
            pi.unit_price AS price
           FROM ((((purchaseunits pu
             JOIN purchaseitems pi ON ((pu.purchase_item_id = pi.purchase_item_id)))
             JOIN purchaseinvoices p ON ((pi.purchase_invoice_id = p.purchase_invoice_id)))
             JOIN items i ON ((pi.item_id = i.item_id)))
             JOIN parties v ON ((p.vendor_id = v.party_id)))
          WHERE ((i.item_name)::text ~~* '%iPhone 15 Pro%'::text)
        ), sale_history AS (
         SELECT i.item_id,
            i.item_name,
            pu.serial_number,
            s.invoice_date AS transaction_date,
            'SALE'::text AS transaction_type,
            c.party_name AS counterparty,
            su.sold_price AS price
           FROM (((((soldunits su
             JOIN purchaseunits pu ON ((su.unit_id = pu.unit_id)))
             JOIN salesitems si ON ((su.sales_item_id = si.sales_item_id)))
             JOIN salesinvoices s ON ((si.sales_invoice_id = s.sales_invoice_id)))
             JOIN items i ON ((si.item_id = i.item_id)))
             JOIN parties c ON ((s.customer_id = c.party_id)))
          WHERE ((i.item_name)::text ~~* '%iPhone 15 Pro%'::text)
        )
 SELECT item_name,
    serial_number,
    transaction_date,
    transaction_type,
    counterparty,
    price
   FROM ( SELECT purchase_history.item_id,
            purchase_history.item_name,
            purchase_history.serial_number,
            purchase_history.transaction_date,
            purchase_history.transaction_type,
            purchase_history.counterparty,
            purchase_history.price
           FROM purchase_history
        UNION ALL
         SELECT sale_history.item_id,
            sale_history.item_name,
            sale_history.serial_number,
            sale_history.transaction_date,
            sale_history.transaction_type,
            sale_history.counterparty,
            sale_history.price
           FROM sale_history) combined
  ORDER BY transaction_date, transaction_type DESC, serial_number;
--
-- Name: item_last_purchase_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW item_last_purchase_view AS
 WITH last_purchase AS (
         SELECT DISTINCT ON (pi.item_id) pi.item_id,
            pi.unit_price AS last_purchase_price,
            pinv.invoice_date AS last_purchase_date
           FROM (purchaseitems pi
             JOIN purchaseinvoices pinv ON ((pi.purchase_invoice_id = pinv.purchase_invoice_id)))
          ORDER BY pi.item_id, pinv.invoice_date DESC
        )
 SELECT i.item_name,
    i.category,
    i.brand,
    lp.last_purchase_price,
    lp.last_purchase_date
   FROM (items i
     LEFT JOIN last_purchase lp ON ((i.item_id = lp.item_id)))
  ORDER BY i.item_name;
--
-- Name: item_last_sale_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW item_last_sale_view AS
 WITH last_sale AS (
         SELECT DISTINCT ON (si.item_id) si.item_id,
            si.unit_price AS last_sale_price,
            sinv.invoice_date AS last_sale_date
           FROM (salesitems si
             JOIN salesinvoices sinv ON ((si.sales_invoice_id = sinv.sales_invoice_id)))
          ORDER BY si.item_id, sinv.invoice_date DESC
        )
 SELECT i.item_name,
    i.category,
    i.brand,
    ls.last_sale_price,
    ls.last_sale_date
   FROM (items i
     LEFT JOIN last_sale ls ON ((i.item_id = ls.item_id)))
  ORDER BY i.item_name;
--
-- Name: items_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE items_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: items_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE items_item_id_seq OWNED BY items.item_id;
--
-- Name: journalentries_journal_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE journalentries_journal_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: journalentries_journal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE journalentries_journal_id_seq OWNED BY journalentries.journal_id;
--
-- Name: journallines_line_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE journallines_line_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: journallines_line_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE journallines_line_id_seq OWNED BY journallines.line_id;
--
-- Name: parties_party_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE parties_party_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: parties_party_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE parties_party_id_seq OWNED BY parties.party_id;
--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE payments (
    payment_id bigint NOT NULL,
    party_id bigint NOT NULL,
    account_id bigint NOT NULL,
    amount numeric(14,4) NOT NULL,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    method character varying(20),
    reference_no character varying(100),
    journal_id bigint,
    date_created timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    notes text,
    description text,
    created_by integer,
    CONSTRAINT payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payments_method_check CHECK (((method)::text = ANY (ARRAY[('Cash'::character varying)::text, ('Bank'::character varying)::text, ('Cheque'::character varying)::text, ('Online'::character varying)::text])))
);
--
-- Name: payments_payment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE payments_payment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: payments_payment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE payments_payment_id_seq OWNED BY payments.payment_id;
--
-- Name: payments_ref_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE payments_ref_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: purchaseinvoices_purchase_invoice_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE purchaseinvoices_purchase_invoice_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: purchaseinvoices_purchase_invoice_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE purchaseinvoices_purchase_invoice_id_seq OWNED BY purchaseinvoices.purchase_invoice_id;
--
-- Name: purchaseitems_purchase_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE purchaseitems_purchase_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: purchaseitems_purchase_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE purchaseitems_purchase_item_id_seq OWNED BY purchaseitems.purchase_item_id;
--
-- Name: purchasereturnitems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE purchasereturnitems (
    return_item_id bigint NOT NULL,
    purchase_return_id bigint NOT NULL,
    item_id bigint NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    serial_number character varying(100) NOT NULL
);
--
-- Name: purchasereturnitems_return_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE purchasereturnitems_return_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: purchasereturnitems_return_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE purchasereturnitems_return_item_id_seq OWNED BY purchasereturnitems.return_item_id;
--
-- Name: purchasereturns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE purchasereturns (
    purchase_return_id bigint NOT NULL,
    vendor_id bigint NOT NULL,
    return_date date DEFAULT CURRENT_DATE NOT NULL,
    total_amount numeric(14,2) DEFAULT 0 NOT NULL,
    journal_id bigint,
    created_by integer
);
--
-- Name: purchasereturns_purchase_return_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE purchasereturns_purchase_return_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: purchasereturns_purchase_return_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE purchasereturns_purchase_return_id_seq OWNED BY purchasereturns.purchase_return_id;
--
-- Name: purchaseunits_unit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE purchaseunits_unit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: purchaseunits_unit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE purchaseunits_unit_id_seq OWNED BY purchaseunits.unit_id;
--
-- Name: receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE receipts (
    receipt_id bigint NOT NULL,
    party_id bigint NOT NULL,
    account_id bigint NOT NULL,
    amount numeric(14,4) NOT NULL,
    receipt_date date DEFAULT CURRENT_DATE NOT NULL,
    method character varying(20),
    reference_no character varying(100),
    journal_id bigint,
    date_created timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    notes text,
    description text,
    created_by integer,
    CONSTRAINT receipts_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT receipts_method_check CHECK (((method)::text = ANY (ARRAY[('Cash'::character varying)::text, ('Bank'::character varying)::text, ('Cheque'::character varying)::text, ('Online'::character varying)::text])))
);
--
-- Name: receipts_receipt_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE receipts_receipt_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: receipts_receipt_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE receipts_receipt_id_seq OWNED BY receipts.receipt_id;
--
-- Name: receipts_ref_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE receipts_ref_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: sale_wise_profit_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW sale_wise_profit_view AS
 WITH sold_serials AS (
         SELECT su.sold_unit_id,
            su.sold_price,
            pu.serial_number,
            si.sales_item_id,
            s.sales_invoice_id,
            s.invoice_date AS sale_date,
            i.item_name,
            i.item_code,
            i.brand,
            i.category,
            si.item_id
           FROM ((((soldunits su
             JOIN purchaseunits pu ON ((su.unit_id = pu.unit_id)))
             JOIN salesitems si ON ((su.sales_item_id = si.sales_item_id)))
             JOIN salesinvoices s ON ((si.sales_invoice_id = s.sales_invoice_id)))
             JOIN items i ON ((si.item_id = i.item_id)))
          WHERE ((s.invoice_date >= '2025-10-17'::date) AND (s.invoice_date <= '2025-10-31'::date))
        ), purchased_serials AS (
         SELECT pu.unit_id,
            pu.serial_number,
            pi.purchase_item_id,
            p.purchase_invoice_id,
            p.invoice_date AS purchase_date,
            p.vendor_id,
            i.item_id,
            i.item_name,
            pi.unit_price AS purchase_price
           FROM (((purchaseunits pu
             JOIN purchaseitems pi ON ((pu.purchase_item_id = pi.purchase_item_id)))
             JOIN purchaseinvoices p ON ((pi.purchase_invoice_id = p.purchase_invoice_id)))
             JOIN items i ON ((pi.item_id = i.item_id)))
        )
 SELECT ss.sale_date,
    ss.serial_number,
    ss.item_name,
    ss.sold_price AS sale_price,
    ps.purchase_price,
    round((ss.sold_price - ps.purchase_price), 2) AS profit_loss,
        CASE
            WHEN (ps.purchase_price > (0)::numeric) THEN round((((ss.sold_price - ps.purchase_price) / ps.purchase_price) * (100)::numeric), 2)
            ELSE NULL::numeric
        END AS profit_loss_percent,
    v.party_name AS vendor_name,
    ps.purchase_date
   FROM ((sold_serials ss
     LEFT JOIN purchased_serials ps ON (((ss.serial_number)::text = (ps.serial_number)::text)))
     LEFT JOIN parties v ON ((ps.vendor_id = v.party_id)))
  ORDER BY ss.sale_date, ss.item_name, ss.serial_number;
--
-- Name: salesinvoices_sales_invoice_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE salesinvoices_sales_invoice_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: salesinvoices_sales_invoice_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE salesinvoices_sales_invoice_id_seq OWNED BY salesinvoices.sales_invoice_id;
--
-- Name: salesitems_sales_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE salesitems_sales_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: salesitems_sales_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE salesitems_sales_item_id_seq OWNED BY salesitems.sales_item_id;
--
-- Name: salesreturnitems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE salesreturnitems (
    return_item_id bigint NOT NULL,
    sales_return_id bigint NOT NULL,
    item_id bigint NOT NULL,
    sold_price numeric(12,2) NOT NULL,
    cost_price numeric(12,2) NOT NULL,
    serial_number character varying(100) NOT NULL
);
--
-- Name: salesreturnitems_return_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE salesreturnitems_return_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: salesreturnitems_return_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE salesreturnitems_return_item_id_seq OWNED BY salesreturnitems.return_item_id;
--
-- Name: salesreturns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE salesreturns (
    sales_return_id bigint NOT NULL,
    customer_id bigint NOT NULL,
    return_date date DEFAULT CURRENT_DATE NOT NULL,
    total_amount numeric(14,2) DEFAULT 0 NOT NULL,
    journal_id bigint,
    created_by integer
);
--
-- Name: salesreturns_sales_return_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE salesreturns_sales_return_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: salesreturns_sales_return_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE salesreturns_sales_return_id_seq OWNED BY salesreturns.sales_return_id;
--
-- Name: soldunits_sold_unit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE soldunits_sold_unit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: soldunits_sold_unit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE soldunits_sold_unit_id_seq OWNED BY soldunits.sold_unit_id;
--
-- Name: standing_company_worth_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW standing_company_worth_view AS
 WITH journal_summary AS (
         SELECT jl.account_id,
            jl.party_id,
            COALESCE(sum(jl.debit), (0)::numeric) AS debit,
            COALESCE(sum(jl.credit), (0)::numeric) AS credit
           FROM journallines jl
          GROUP BY jl.account_id, jl.party_id
        ), account_totals AS (
         SELECT coa.account_id,
            coa.account_code,
            coa.account_name,
            coa.account_type,
            COALESCE(sum(js.debit), (0)::numeric) AS total_debit,
            COALESCE(sum(js.credit), (0)::numeric) AS total_credit
           FROM (chartofaccounts coa
             LEFT JOIN journal_summary js ON (((coa.account_id = js.account_id) AND (((coa.account_name)::text = ANY (ARRAY[('Accounts Receivable'::character varying)::text, ('Accounts Payable'::character varying)::text])) OR (js.party_id IS NULL)))))
          WHERE (NOT (coa.account_id IN ( SELECT DISTINCT p.ap_account_id
                   FROM parties p
                  WHERE (((p.party_type)::text = 'Expense'::text) AND (p.ap_account_id IS NOT NULL)))))
          GROUP BY coa.account_id, coa.account_code, coa.account_name, coa.account_type
        ), party_totals AS (
         SELECT p.party_id,
            p.party_name,
            p.party_type,
            COALESCE(sum(js.debit), (0)::numeric) AS total_debit,
            COALESCE(sum(js.credit), (0)::numeric) AS total_credit,
            (COALESCE(sum(js.debit), (0)::numeric) - COALESCE(sum(js.credit), (0)::numeric)) AS balance
           FROM (parties p
             LEFT JOIN journal_summary js ON ((js.party_id = p.party_id)))
          GROUP BY p.party_id, p.party_name, p.party_type
        ), classified_parties AS (
         SELECT pt.party_id,
            pt.party_name,
            pt.party_type,
            pt.total_debit,
            pt.total_credit,
            pt.balance,
                CASE
                    WHEN (((pt.party_type)::text = 'Customer'::text) AND (pt.balance < (0)::numeric)) THEN 'Accounts Payable'::text
                    WHEN (((pt.party_type)::text = 'Vendor'::text) AND (pt.balance > (0)::numeric)) THEN 'Accounts Receivable'::text
                    WHEN ((pt.party_type)::text = 'Both'::text) THEN
                    CASE
                        WHEN (pt.balance >= (0)::numeric) THEN 'Accounts Receivable'::text
                        ELSE 'Accounts Payable'::text
                    END
                    WHEN ((pt.party_type)::text = 'Customer'::text) THEN 'Accounts Receivable'::text
                    WHEN ((pt.party_type)::text = 'Vendor'::text) THEN 'Accounts Payable'::text
                    ELSE 'Expense Party'::text
                END AS effective_type
           FROM party_totals pt
        ), control_adjustment AS (
         SELECT classified_parties.effective_type AS account_name,
            sum(GREATEST(classified_parties.balance, (0)::numeric)) AS debit_side,
            sum(abs(LEAST(classified_parties.balance, (0)::numeric))) AS credit_side
           FROM classified_parties
          WHERE (classified_parties.effective_type = ANY (ARRAY['Accounts Receivable'::text, 'Accounts Payable'::text]))
          GROUP BY classified_parties.effective_type
        ), merged_totals AS (
         SELECT coa.account_type,
                CASE
                    WHEN ((coa.account_type)::text = ANY (ARRAY[('Asset'::character varying)::text, ('Expense'::character varying)::text])) THEN (COALESCE(ca.debit_side, at.total_debit, (0)::numeric) - COALESCE(ca.credit_side, at.total_credit, (0)::numeric))
                    WHEN ((coa.account_type)::text = ANY (ARRAY[('Liability'::character varying)::text, ('Equity'::character varying)::text, ('Revenue'::character varying)::text])) THEN (COALESCE(ca.credit_side, at.total_credit, (0)::numeric) - COALESCE(ca.debit_side, at.total_debit, (0)::numeric))
                    ELSE (0)::numeric
                END AS net_balance
           FROM ((account_totals at
             JOIN chartofaccounts coa ON ((at.account_id = coa.account_id)))
             LEFT JOIN control_adjustment ca ON ((ca.account_name = (coa.account_name)::text)))
        ), summary AS (
         SELECT merged_totals.account_type,
            sum(merged_totals.net_balance) AS total
           FROM merged_totals
          GROUP BY merged_totals.account_type
        ), party_expenses AS (
         SELECT sum(classified_parties.balance) AS total_party_expenses
           FROM classified_parties
          WHERE (classified_parties.effective_type = 'Expense Party'::text)
        ), totals AS (
         SELECT COALESCE(sum(
                CASE
                    WHEN ((summary.account_type)::text = 'Asset'::text) THEN summary.total
                    ELSE NULL::numeric
                END), (0)::numeric) AS assets,
            COALESCE(sum(
                CASE
                    WHEN ((summary.account_type)::text = 'Liability'::text) THEN summary.total
                    ELSE NULL::numeric
                END), (0)::numeric) AS liabilities,
            COALESCE(sum(
                CASE
                    WHEN ((summary.account_type)::text = 'Equity'::text) THEN summary.total
                    ELSE NULL::numeric
                END), (0)::numeric) AS equity,
            COALESCE(sum(
                CASE
                    WHEN ((summary.account_type)::text = 'Revenue'::text) THEN summary.total
                    ELSE NULL::numeric
                END), (0)::numeric) AS revenue,
            (COALESCE(sum(
                CASE
                    WHEN ((summary.account_type)::text = 'Expense'::text) THEN summary.total
                    ELSE NULL::numeric
                END), (0)::numeric) + COALESCE(( SELECT party_expenses.total_party_expenses
                   FROM party_expenses), (0)::numeric)) AS expenses
           FROM summary
        )
 SELECT json_build_object('financial_position', json_build_object('total_assets', round(assets, 2), 'total_liabilities', round(liabilities, 2), 'total_equity', round(equity, 2), 'net_worth', round((assets - liabilities), 2)), 'profit_and_loss', json_build_object('total_revenue', round(revenue, 2), 'total_expenses', round(expenses, 2), 'net_profit_loss', round((revenue - expenses), 2))) AS company_standing
   FROM totals;
--
-- Name: stock_report; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW stock_report AS
 WITH stock AS (
         SELECT i.item_id,
            i.item_name,
            count(pu.unit_id) OVER (PARTITION BY i.item_id) AS quantity,
            pu.serial_number,
            pu.serial_comment,
            pi.invoice_date AS purchase_date,
            (CURRENT_DATE - pi.invoice_date) AS age_in_days,
            round((((CURRENT_DATE - pi.invoice_date))::numeric / 30.44), 1) AS age_in_months,
            row_number() OVER (PARTITION BY i.item_id ORDER BY pu.serial_number) AS rn
           FROM (((purchaseunits pu
             JOIN purchaseitems pit ON ((pu.purchase_item_id = pit.purchase_item_id)))
             JOIN purchaseinvoices pi ON ((pit.purchase_invoice_id = pi.purchase_invoice_id)))
             JOIN items i ON ((pit.item_id = i.item_id)))
          WHERE ((pu.in_stock = true) AND (NOT (EXISTS ( SELECT 1
                   FROM soldunits su
                  WHERE ((su.unit_id = pu.unit_id) AND ((su.status)::text = 'Sold'::text))))) AND (NOT (EXISTS ( SELECT 1
                   FROM purchasereturnitems pri
                  WHERE ((pri.serial_number)::text = (pu.serial_number)::text)))))
        )
 SELECT
        CASE
            WHEN (rn = 1) THEN (item_id)::text
            ELSE ''::text
        END AS item_id,
        CASE
            WHEN (rn = 1) THEN item_name
            ELSE ''::character varying
        END AS item_name,
        CASE
            WHEN (rn = 1) THEN (quantity)::text
            ELSE ''::text
        END AS quantity,
    serial_number,
    serial_comment,
    age_in_days,
    age_in_months
   FROM stock
  ORDER BY ((item_id)::integer), rn;
--
-- Name: stock_worth_report; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW stock_worth_report AS
 WITH stock AS (
         SELECT i.item_id,
            i.item_name,
            count(pu.unit_id) OVER (PARTITION BY i.item_id) AS quantity,
            pu.serial_number,
            pu.serial_comment,
            pit.unit_price AS purchase_price,
            i.sale_price AS market_price,
            row_number() OVER (PARTITION BY i.item_id ORDER BY pu.serial_number) AS rn
           FROM ((purchaseunits pu
             JOIN purchaseitems pit ON ((pu.purchase_item_id = pit.purchase_item_id)))
             JOIN items i ON ((pit.item_id = i.item_id)))
          WHERE ((pu.in_stock = true) AND (NOT (EXISTS ( SELECT 1
                   FROM soldunits su
                  WHERE ((su.unit_id = pu.unit_id) AND ((su.status)::text = 'Sold'::text))))) AND (NOT (EXISTS ( SELECT 1
                   FROM purchasereturnitems pri
                  WHERE ((pri.serial_number)::text = (pu.serial_number)::text)))))
        ), running AS (
         SELECT stock.item_id,
            stock.item_name,
            stock.quantity,
            stock.serial_number,
            stock.serial_comment,
            stock.purchase_price,
            stock.market_price,
            sum(stock.purchase_price) OVER (ORDER BY stock.item_id, stock.rn) AS running_total_purchase,
            sum(stock.market_price) OVER (ORDER BY stock.item_id, stock.rn) AS running_total_market,
            stock.rn
           FROM stock
        )
 SELECT
        CASE
            WHEN (rn = 1) THEN (item_id)::text
            ELSE ''::text
        END AS item_id,
        CASE
            WHEN (rn = 1) THEN item_name
            ELSE ''::character varying
        END AS item_name,
        CASE
            WHEN (rn = 1) THEN (quantity)::text
            ELSE ''::text
        END AS quantity,
    serial_number,
    serial_comment,
    purchase_price,
    market_price,
    running_total_purchase,
    running_total_market
   FROM running
  ORDER BY ((item_id)::integer), rn;
--
-- Name: stockmovements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE stockmovements (
    movement_id bigint NOT NULL,
    item_id bigint NOT NULL,
    serial_number text,
    movement_type character varying(20) NOT NULL,
    reference_type character varying(50),
    reference_id bigint,
    movement_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    quantity integer NOT NULL,
    CONSTRAINT stockmovements_movement_type_check CHECK (((movement_type)::text = ANY (ARRAY[('IN'::character varying)::text, ('OUT'::character varying)::text])))
);
--
-- Name: stockmovements_movement_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE stockmovements_movement_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: stockmovements_movement_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE stockmovements_movement_id_seq OWNED BY stockmovements.movement_id;
--
-- Name: vw_dash_daily_sales; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW vw_dash_daily_sales AS
 SELECT invoice_date AS sale_date,
    count(DISTINCT sales_invoice_id) AS invoice_count,
    COALESCE(sum(total_amount), (0)::numeric) AS total_revenue
   FROM salesinvoices si
  GROUP BY invoice_date;
--
-- Name: vw_dash_expenses; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW vw_dash_expenses AS
 SELECT je.entry_date,
    je.description AS expense_note,
    coa.account_name AS expense_category,
    coa.account_id,
    COALESCE(jl.debit, (0)::numeric) AS amount,
    p.party_name
   FROM (((journalentries je
     JOIN journallines jl ON ((jl.journal_id = je.journal_id)))
     JOIN chartofaccounts coa ON ((coa.account_id = jl.account_id)))
     LEFT JOIN parties p ON ((p.party_id = jl.party_id)))
  WHERE (((coa.account_type)::text ~~* '%expense%'::text) AND (jl.debit > (0)::numeric));
--
-- Name: vw_dash_party_ar_balance; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW vw_dash_party_ar_balance AS
 SELECT p.party_id,
    p.party_name,
    p.party_type,
    p.contact_info,
    COALESCE((sum(jl.debit) - sum(jl.credit)), (0)::numeric) AS ar_balance,
    max(je.entry_date) AS last_transaction_date
   FROM ((parties p
     JOIN journallines jl ON ((jl.party_id = p.party_id)))
     JOIN journalentries je ON ((je.journal_id = jl.journal_id)))
  WHERE (p.ar_account_id IS NOT NULL)
  GROUP BY p.party_id, p.party_name, p.party_type, p.contact_info
 HAVING (COALESCE((sum(jl.debit) - sum(jl.credit)), (0)::numeric) > (0)::numeric);
--
-- Name: vw_dash_stock_overview; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW vw_dash_stock_overview AS
 SELECT i.item_id,
    i.item_name,
    i.category,
    i.brand,
    i.sale_price,
    count(pu.unit_id) FILTER (WHERE (pu.in_stock = true)) AS units_in_stock,
    COALESCE(avg(pi2.unit_price) FILTER (WHERE (pu.in_stock = true)), (0)::numeric) AS avg_cost_price,
    max(pinv.invoice_date) FILTER (WHERE (pu.in_stock = true)) AS last_purchased,
    ( SELECT max(sinv.invoice_date) AS max
           FROM ((salesitems sitem
             JOIN soldunits su2 ON ((su2.sales_item_id = sitem.sales_item_id)))
             JOIN salesinvoices sinv ON ((sinv.sales_invoice_id = sitem.sales_invoice_id)))
          WHERE (sitem.item_id = i.item_id)) AS last_sold_date
   FROM (((items i
     LEFT JOIN purchaseitems pi2 ON ((pi2.item_id = i.item_id)))
     LEFT JOIN purchaseunits pu ON ((pu.purchase_item_id = pi2.purchase_item_id)))
     LEFT JOIN purchaseinvoices pinv ON ((pinv.purchase_invoice_id = pi2.purchase_invoice_id)))
  GROUP BY i.item_id, i.item_name, i.category, i.brand, i.sale_price;
--
-- Name: vw_trial_balance; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW vw_trial_balance AS
 WITH journal_summary AS (
         SELECT jl.account_id,
            jl.party_id,
            COALESCE(sum(jl.debit), (0)::numeric) AS debit,
            COALESCE(sum(jl.credit), (0)::numeric) AS credit
           FROM journallines jl
          GROUP BY jl.account_id, jl.party_id
        ), account_totals AS (
         SELECT coa.account_id,
            coa.account_code,
            coa.account_name,
            coa.account_type,
            sum(js.debit) AS total_debit,
            sum(js.credit) AS total_credit
           FROM (chartofaccounts coa
             LEFT JOIN journal_summary js ON (((coa.account_id = js.account_id) AND (((coa.account_name)::text = ANY (ARRAY[('Accounts Receivable'::character varying)::text, ('Accounts Payable'::character varying)::text])) OR (js.party_id IS NULL)))))
          WHERE (NOT (coa.account_id IN ( SELECT DISTINCT p.ap_account_id
                   FROM parties p
                  WHERE (((p.party_type)::text = 'Expense'::text) AND (p.ap_account_id IS NOT NULL)))))
          GROUP BY coa.account_id, coa.account_code, coa.account_name, coa.account_type
        ), party_totals AS (
         SELECT p.party_id,
            p.party_name,
            p.party_type,
            COALESCE(sum(js.debit), (0)::numeric) AS total_debit,
            COALESCE(sum(js.credit), (0)::numeric) AS total_credit,
            (COALESCE(sum(js.debit), (0)::numeric) - COALESCE(sum(js.credit), (0)::numeric)) AS balance
           FROM (parties p
             LEFT JOIN journal_summary js ON ((js.party_id = p.party_id)))
          GROUP BY p.party_id, p.party_name, p.party_type
        ), classified_parties AS (
         SELECT pt.party_id,
            pt.party_name,
            pt.party_type,
            pt.total_debit,
            pt.total_credit,
            pt.balance,
                CASE
                    WHEN (((pt.party_type)::text = 'Customer'::text) AND (pt.balance < (0)::numeric)) THEN 'Accounts Payable'::text
                    WHEN (((pt.party_type)::text = 'Vendor'::text) AND (pt.balance > (0)::numeric)) THEN 'Accounts Receivable'::text
                    WHEN ((pt.party_type)::text = 'Both'::text) THEN
                    CASE
                        WHEN (pt.balance >= (0)::numeric) THEN 'Accounts Receivable'::text
                        ELSE 'Accounts Payable'::text
                    END
                    WHEN ((pt.party_type)::text = 'Customer'::text) THEN 'Accounts Receivable'::text
                    WHEN ((pt.party_type)::text = 'Vendor'::text) THEN 'Accounts Payable'::text
                    ELSE 'Expense Party'::text
                END AS effective_type
           FROM party_totals pt
        ), control_adjustment AS (
         SELECT classified_parties.effective_type AS account_name,
            sum(GREATEST(classified_parties.balance, (0)::numeric)) AS debit_side,
            sum(abs(LEAST(classified_parties.balance, (0)::numeric))) AS credit_side
           FROM classified_parties
          WHERE (classified_parties.effective_type = ANY (ARRAY['Accounts Receivable'::text, 'Accounts Payable'::text]))
          GROUP BY classified_parties.effective_type
        )
 SELECT at.account_code AS code,
    at.account_name AS name,
    at.account_type AS type,
    COALESCE(ca.debit_side, at.total_debit, (0)::numeric) AS total_debit,
    COALESCE(ca.credit_side, at.total_credit, (0)::numeric) AS total_credit,
    (COALESCE(ca.debit_side, at.total_debit, (0)::numeric) - COALESCE(ca.credit_side, at.total_credit, (0)::numeric)) AS balance
   FROM (account_totals at
     LEFT JOIN control_adjustment ca ON ((ca.account_name = (at.account_name)::text)))
UNION ALL
 SELECT NULL::character varying AS code,
    pt.party_name AS name,
    pt.effective_type AS type,
    pt.total_debit,
    pt.total_credit,
    pt.balance
   FROM classified_parties pt
  WHERE ((pt.total_debit <> (0)::numeric) OR (pt.total_credit <> (0)::numeric))
  ORDER BY 1 NULLS FIRST, 2;
--
-- Name: chartofaccounts account_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY chartofaccounts ALTER COLUMN account_id SET DEFAULT nextval('chartofaccounts_account_id_seq'::regclass);
--
-- Name: items item_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY items ALTER COLUMN item_id SET DEFAULT nextval('items_item_id_seq'::regclass);
--
-- Name: journalentries journal_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY journalentries ALTER COLUMN journal_id SET DEFAULT nextval('journalentries_journal_id_seq'::regclass);
--
-- Name: journallines line_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY journallines ALTER COLUMN line_id SET DEFAULT nextval('journallines_line_id_seq'::regclass);
--
-- Name: parties party_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY parties ALTER COLUMN party_id SET DEFAULT nextval('parties_party_id_seq'::regclass);
--
-- Name: payments payment_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY payments ALTER COLUMN payment_id SET DEFAULT nextval('payments_payment_id_seq'::regclass);
--
-- Name: purchaseinvoices purchase_invoice_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchaseinvoices ALTER COLUMN purchase_invoice_id SET DEFAULT nextval('purchaseinvoices_purchase_invoice_id_seq'::regclass);
--
-- Name: purchaseitems purchase_item_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchaseitems ALTER COLUMN purchase_item_id SET DEFAULT nextval('purchaseitems_purchase_item_id_seq'::regclass);
--
-- Name: purchasereturnitems return_item_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchasereturnitems ALTER COLUMN return_item_id SET DEFAULT nextval('purchasereturnitems_return_item_id_seq'::regclass);
--
-- Name: purchasereturns purchase_return_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchasereturns ALTER COLUMN purchase_return_id SET DEFAULT nextval('purchasereturns_purchase_return_id_seq'::regclass);
--
-- Name: purchaseunits unit_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchaseunits ALTER COLUMN unit_id SET DEFAULT nextval('purchaseunits_unit_id_seq'::regclass);
--
-- Name: receipts receipt_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY receipts ALTER COLUMN receipt_id SET DEFAULT nextval('receipts_receipt_id_seq'::regclass);
--
-- Name: salesinvoices sales_invoice_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY salesinvoices ALTER COLUMN sales_invoice_id SET DEFAULT nextval('salesinvoices_sales_invoice_id_seq'::regclass);
--
-- Name: salesitems sales_item_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY salesitems ALTER COLUMN sales_item_id SET DEFAULT nextval('salesitems_sales_item_id_seq'::regclass);
--
-- Name: salesreturnitems return_item_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY salesreturnitems ALTER COLUMN return_item_id SET DEFAULT nextval('salesreturnitems_return_item_id_seq'::regclass);
--
-- Name: salesreturns sales_return_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY salesreturns ALTER COLUMN sales_return_id SET DEFAULT nextval('salesreturns_sales_return_id_seq'::regclass);
--
-- Name: soldunits sold_unit_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY soldunits ALTER COLUMN sold_unit_id SET DEFAULT nextval('soldunits_sold_unit_id_seq'::regclass);
--
-- Name: stockmovements movement_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY stockmovements ALTER COLUMN movement_id SET DEFAULT nextval('stockmovements_movement_id_seq'::regclass);
--
-- Name: chartofaccounts chartofaccounts_account_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY chartofaccounts
    ADD CONSTRAINT chartofaccounts_account_code_key UNIQUE (account_code);
--
-- Name: chartofaccounts chartofaccounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY chartofaccounts
    ADD CONSTRAINT chartofaccounts_pkey PRIMARY KEY (account_id);
--
-- Name: items items_item_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY items
    ADD CONSTRAINT items_item_code_key UNIQUE (item_code);
--
-- Name: items items_item_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY items
    ADD CONSTRAINT items_item_name_key UNIQUE (item_name);
--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY items
    ADD CONSTRAINT items_pkey PRIMARY KEY (item_id);
--
-- Name: journalentries journalentries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY journalentries
    ADD CONSTRAINT journalentries_pkey PRIMARY KEY (journal_id);
--
-- Name: journallines journallines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY journallines
    ADD CONSTRAINT journallines_pkey PRIMARY KEY (line_id);
--
-- Name: parties parties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY parties
    ADD CONSTRAINT parties_pkey PRIMARY KEY (party_id);
--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (payment_id);
--
-- Name: purchaseinvoices purchaseinvoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchaseinvoices
    ADD CONSTRAINT purchaseinvoices_pkey PRIMARY KEY (purchase_invoice_id);
--
-- Name: purchaseitems purchaseitems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchaseitems
    ADD CONSTRAINT purchaseitems_pkey PRIMARY KEY (purchase_item_id);
--
-- Name: purchasereturnitems purchasereturnitems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchasereturnitems
    ADD CONSTRAINT purchasereturnitems_pkey PRIMARY KEY (return_item_id);
--
-- Name: purchasereturns purchasereturns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchasereturns
    ADD CONSTRAINT purchasereturns_pkey PRIMARY KEY (purchase_return_id);
--
-- Name: purchaseunits purchaseunits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchaseunits
    ADD CONSTRAINT purchaseunits_pkey PRIMARY KEY (unit_id);
--
-- Name: purchaseunits purchaseunits_serial_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchaseunits
    ADD CONSTRAINT purchaseunits_serial_number_key UNIQUE (serial_number);
--
-- Name: receipts receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (receipt_id);
--
-- Name: salesinvoices salesinvoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY salesinvoices
    ADD CONSTRAINT salesinvoices_pkey PRIMARY KEY (sales_invoice_id);
--
-- Name: salesitems salesitems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY salesitems
    ADD CONSTRAINT salesitems_pkey PRIMARY KEY (sales_item_id);
--
-- Name: salesreturnitems salesreturnitems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY salesreturnitems
    ADD CONSTRAINT salesreturnitems_pkey PRIMARY KEY (return_item_id);
--
-- Name: salesreturns salesreturns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY salesreturns
    ADD CONSTRAINT salesreturns_pkey PRIMARY KEY (sales_return_id);
--
-- Name: soldunits soldunits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY soldunits
    ADD CONSTRAINT soldunits_pkey PRIMARY KEY (sold_unit_id);
--
-- Name: stockmovements stockmovements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY stockmovements
    ADD CONSTRAINT stockmovements_pkey PRIMARY KEY (movement_id);
--
-- Name: parties unique_party_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY parties
    ADD CONSTRAINT unique_party_name UNIQUE (party_name);
--
-- Name: parties trg_party_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_party_insert AFTER INSERT ON parties FOR EACH ROW EXECUTE FUNCTION trg_party_opening_balance();
--
-- Name: payments trg_payment_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payment_delete AFTER DELETE ON payments FOR EACH ROW EXECUTE FUNCTION trg_payment_journal();
--
-- Name: payments trg_payment_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payment_insert AFTER INSERT ON payments FOR EACH ROW EXECUTE FUNCTION trg_payment_journal();
--
-- Name: payments trg_payment_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payment_update AFTER UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION trg_payment_journal();
--
-- Name: receipts trg_receipt_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_receipt_delete AFTER DELETE ON receipts FOR EACH ROW EXECUTE FUNCTION trg_receipt_journal();
--
-- Name: receipts trg_receipt_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_receipt_insert AFTER INSERT ON receipts FOR EACH ROW EXECUTE FUNCTION trg_receipt_journal();
--
-- Name: receipts trg_receipt_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_receipt_update AFTER UPDATE ON receipts FOR EACH ROW EXECUTE FUNCTION trg_receipt_journal();
--
-- Name: soldunits trg_soldunits_fix_ghost_stock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_soldunits_fix_ghost_stock AFTER INSERT OR DELETE OR UPDATE ON soldunits FOR EACH STATEMENT EXECUTE FUNCTION trg_fn_soldunits_fix_ghost_stock();
--
-- Name: TRIGGER trg_soldunits_fix_ghost_stock ON soldunits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TRIGGER trg_soldunits_fix_ghost_stock ON soldunits IS 'Fires once after each full INSERT/UPDATE/DELETE statement on soldunits.
Cleans up any ghost serials left with in_stock = FALSE and no matching
soldunits or purchasereturnitems record.';
--
-- Name: chartofaccounts chartofaccounts_parent_account_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY chartofaccounts
    ADD CONSTRAINT chartofaccounts_parent_account_fkey FOREIGN KEY (parent_account) REFERENCES chartofaccounts(account_id) ON DELETE SET NULL;
--
-- Name: items items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY items
    ADD CONSTRAINT items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.auth_user(id) ON DELETE SET NULL;
--
-- Name: journallines journallines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY journallines
    ADD CONSTRAINT journallines_account_id_fkey FOREIGN KEY (account_id) REFERENCES chartofaccounts(account_id);
--
-- Name: journallines journallines_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY journallines
    ADD CONSTRAINT journallines_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES journalentries(journal_id) ON DELETE CASCADE;
--
-- Name: journallines journallines_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY journallines
    ADD CONSTRAINT journallines_party_id_fkey FOREIGN KEY (party_id) REFERENCES parties(party_id) ON DELETE SET NULL;
--
-- Name: parties parties_ap_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY parties
    ADD CONSTRAINT parties_ap_account_id_fkey FOREIGN KEY (ap_account_id) REFERENCES chartofaccounts(account_id) ON DELETE SET NULL;
--
-- Name: parties parties_ar_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY parties
    ADD CONSTRAINT parties_ar_account_id_fkey FOREIGN KEY (ar_account_id) REFERENCES chartofaccounts(account_id) ON DELETE SET NULL;
--
-- Name: parties parties_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY parties
    ADD CONSTRAINT parties_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.auth_user(id) ON DELETE SET NULL;
--
-- Name: payments payments_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY payments
    ADD CONSTRAINT payments_account_id_fkey FOREIGN KEY (account_id) REFERENCES chartofaccounts(account_id);
--
-- Name: payments payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY payments
    ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.auth_user(id) ON DELETE SET NULL;
--
-- Name: payments payments_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY payments
    ADD CONSTRAINT payments_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES journalentries(journal_id) ON DELETE SET NULL;
--
-- Name: payments payments_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY payments
    ADD CONSTRAINT payments_party_id_fkey FOREIGN KEY (party_id) REFERENCES parties(party_id) ON DELETE CASCADE;
--
-- Name: purchaseinvoices purchaseinvoices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchaseinvoices
    ADD CONSTRAINT purchaseinvoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.auth_user(id) ON DELETE SET NULL;
--
-- Name: purchaseinvoices purchaseinvoices_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchaseinvoices
    ADD CONSTRAINT purchaseinvoices_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES journalentries(journal_id) ON DELETE SET NULL;
--
-- Name: purchaseinvoices purchaseinvoices_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchaseinvoices
    ADD CONSTRAINT purchaseinvoices_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES parties(party_id) ON DELETE CASCADE;
--
-- Name: purchaseitems purchaseitems_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchaseitems
    ADD CONSTRAINT purchaseitems_item_id_fkey FOREIGN KEY (item_id) REFERENCES items(item_id);
--
-- Name: purchaseitems purchaseitems_purchase_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchaseitems
    ADD CONSTRAINT purchaseitems_purchase_invoice_id_fkey FOREIGN KEY (purchase_invoice_id) REFERENCES purchaseinvoices(purchase_invoice_id) ON DELETE CASCADE;
--
-- Name: purchasereturnitems purchasereturnitems_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchasereturnitems
    ADD CONSTRAINT purchasereturnitems_item_id_fkey FOREIGN KEY (item_id) REFERENCES items(item_id);
--
-- Name: purchasereturnitems purchasereturnitems_purchase_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchasereturnitems
    ADD CONSTRAINT purchasereturnitems_purchase_return_id_fkey FOREIGN KEY (purchase_return_id) REFERENCES purchasereturns(purchase_return_id) ON DELETE CASCADE;
--
-- Name: purchasereturns purchasereturns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchasereturns
    ADD CONSTRAINT purchasereturns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.auth_user(id) ON DELETE SET NULL;
--
-- Name: purchasereturns purchasereturns_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchasereturns
    ADD CONSTRAINT purchasereturns_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES journalentries(journal_id) ON DELETE SET NULL;
--
-- Name: purchasereturns purchasereturns_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchasereturns
    ADD CONSTRAINT purchasereturns_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES parties(party_id) ON DELETE CASCADE;
--
-- Name: purchaseunits purchaseunits_purchase_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY purchaseunits
    ADD CONSTRAINT purchaseunits_purchase_item_id_fkey FOREIGN KEY (purchase_item_id) REFERENCES purchaseitems(purchase_item_id) ON DELETE CASCADE;
--
-- Name: receipts receipts_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY receipts
    ADD CONSTRAINT receipts_account_id_fkey FOREIGN KEY (account_id) REFERENCES chartofaccounts(account_id);
--
-- Name: receipts receipts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY receipts
    ADD CONSTRAINT receipts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.auth_user(id) ON DELETE SET NULL;
--
-- Name: receipts receipts_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY receipts
    ADD CONSTRAINT receipts_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES journalentries(journal_id) ON DELETE SET NULL;
--
-- Name: receipts receipts_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY receipts
    ADD CONSTRAINT receipts_party_id_fkey FOREIGN KEY (party_id) REFERENCES parties(party_id) ON DELETE CASCADE;
--
-- Name: salesinvoices salesinvoices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY salesinvoices
    ADD CONSTRAINT salesinvoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.auth_user(id) ON DELETE SET NULL;
--
-- Name: salesinvoices salesinvoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY salesinvoices
    ADD CONSTRAINT salesinvoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES parties(party_id) ON DELETE CASCADE;
--
-- Name: salesinvoices salesinvoices_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY salesinvoices
    ADD CONSTRAINT salesinvoices_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES journalentries(journal_id) ON DELETE SET NULL;
--
-- Name: salesitems salesitems_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY salesitems
    ADD CONSTRAINT salesitems_item_id_fkey FOREIGN KEY (item_id) REFERENCES items(item_id);
--
-- Name: salesitems salesitems_sales_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY salesitems
    ADD CONSTRAINT salesitems_sales_invoice_id_fkey FOREIGN KEY (sales_invoice_id) REFERENCES salesinvoices(sales_invoice_id) ON DELETE CASCADE;
--
-- Name: salesreturnitems salesreturnitems_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY salesreturnitems
    ADD CONSTRAINT salesreturnitems_item_id_fkey FOREIGN KEY (item_id) REFERENCES items(item_id);
--
-- Name: salesreturnitems salesreturnitems_sales_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY salesreturnitems
    ADD CONSTRAINT salesreturnitems_sales_return_id_fkey FOREIGN KEY (sales_return_id) REFERENCES salesreturns(sales_return_id) ON DELETE CASCADE;
--
-- Name: salesreturns salesreturns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY salesreturns
    ADD CONSTRAINT salesreturns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.auth_user(id) ON DELETE SET NULL;
--
-- Name: salesreturns salesreturns_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY salesreturns
    ADD CONSTRAINT salesreturns_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES parties(party_id) ON DELETE CASCADE;
--
-- Name: salesreturns salesreturns_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY salesreturns
    ADD CONSTRAINT salesreturns_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES journalentries(journal_id) ON DELETE SET NULL;
--
-- Name: soldunits soldunits_sales_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY soldunits
    ADD CONSTRAINT soldunits_sales_item_id_fkey FOREIGN KEY (sales_item_id) REFERENCES salesitems(sales_item_id) ON DELETE CASCADE;
--
-- Name: soldunits soldunits_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY soldunits
    ADD CONSTRAINT soldunits_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES purchaseunits(unit_id) ON DELETE CASCADE;
--
-- Name: stockmovements stockmovements_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY stockmovements
    ADD CONSTRAINT stockmovements_item_id_fkey FOREIGN KEY (item_id) REFERENCES items(item_id);
-- ============================================================
-- FEATURE: Opening Cash in Hand
-- ------------------------------------------------------------
-- Records the company's initial cash position when it starts
-- using the system, mirroring the existing party opening-balance
-- mechanism (see trg_party_opening_balance).
--
-- Double-entry posted (same convention as party opening balances):
--     DEBIT  Cash (Asset)            <amount>
--     CREDIT Owner's Capital (Equity)<amount>
--
-- The Cash balance shown by the app comes from vw_trial_balance
-- (account 'Cash'); posting the entry above makes opening cash
-- flow into the dashboard / cash ledger automatically, with no
-- change to any existing object or calculation.
--
-- Idempotent & editable: a single company-level row is kept; the
-- setter UPSERTs it and keeps the linked journal entry in sync, so
-- re-saving never double-counts.
-- ============================================================

-- ---------- Table -------------------------------------------------
CREATE TABLE IF NOT EXISTS opening_cash (
    opening_cash_id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
    entry_date      DATE          NOT NULL DEFAULT CURRENT_DATE,
    journal_id      BIGINT,
    created_by_id   INTEGER,
    date_created    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_updated    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_singleton    BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT opening_cash_amount_nonneg  CHECK (amount >= 0),
    CONSTRAINT opening_cash_singleton_chk  CHECK (is_singleton = TRUE),
    CONSTRAINT opening_cash_singleton_uniq UNIQUE (is_singleton),
    CONSTRAINT opening_cash_journal_fk FOREIGN KEY (journal_id)
        REFERENCES journalentries (journal_id),
    CONSTRAINT opening_cash_user_fk FOREIGN KEY (created_by_id)
        REFERENCES public.auth_user (id)
);
COMMENT ON TABLE opening_cash IS
    'Company opening cash-in-hand. Single row; setter keeps the linked Opening Cash journal entry in sync.';
-- ---------- Getter ------------------------------------------------
CREATE OR REPLACE FUNCTION get_opening_cash_json()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_build_object(
               'amount',     oc.amount,
               'entry_date', oc.entry_date,
               'journal_id', oc.journal_id,
               'is_set',     TRUE
           )
    INTO result
    FROM opening_cash oc
    WHERE oc.is_singleton
    LIMIT 1;

    IF result IS NULL THEN
        result := jsonb_build_object(
                      'amount', 0, 'entry_date', NULL,
                      'journal_id', NULL, 'is_set', FALSE);
    END IF;

    RETURN result;
END;
$$;
-- ---------- Setter (UPSERT + balanced journal posting) ------------
CREATE OR REPLACE FUNCTION set_opening_cash_from_json(data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_amount   NUMERIC := ROUND(COALESCE((data->>'amount')::NUMERIC, 0), 2);
    v_user     INTEGER := NULLIF(data->>'created_by_id', '')::INTEGER;
    v_cash_acc BIGINT;
    v_cap_acc  BIGINT;
    v_row      opening_cash%ROWTYPE;
    j_id       BIGINT;
BEGIN
    IF v_amount < 0 THEN
        RAISE EXCEPTION 'Opening cash cannot be negative';
    END IF;

    SELECT account_id INTO v_cash_acc
    FROM chartofaccounts
    WHERE account_name = 'Cash' AND account_type = 'Asset'
    LIMIT 1;

    SELECT account_id INTO v_cap_acc
    FROM chartofaccounts
    WHERE account_name = 'Owner''s Capital'
    LIMIT 1;

    IF v_cash_acc IS NULL THEN
        RAISE EXCEPTION 'Cash account not found in ChartOfAccounts';
    END IF;
    IF v_cap_acc IS NULL THEN
        RAISE EXCEPTION 'Owner''s Capital account not found in ChartOfAccounts';
    END IF;

    SELECT * INTO v_row
    FROM opening_cash
    WHERE is_singleton
    LIMIT 1;

    -- Helper journal id (existing one if present)
    j_id := v_row.journal_id;

    IF v_amount > 0 THEN
        IF j_id IS NULL THEN
            -- create a fresh balanced entry
            INSERT INTO journalentries (entry_date, description)
            VALUES (CURRENT_DATE, 'Opening Cash in Hand')
            RETURNING journal_id INTO j_id;

            INSERT INTO journallines (journal_id, account_id, debit)
            VALUES (j_id, v_cash_acc, v_amount);

            INSERT INTO journallines (journal_id, account_id, credit)
            VALUES (j_id, v_cap_acc, v_amount);
        ELSE
            -- keep the existing entry, just update the two amounts
            UPDATE journallines
               SET debit = v_amount, credit = NULL
             WHERE journal_id = j_id AND account_id = v_cash_acc;

            UPDATE journallines
               SET credit = v_amount, debit = NULL
             WHERE journal_id = j_id AND account_id = v_cap_acc;
        END IF;
    ELSE
        -- amount == 0: remove any previously posted entry so nothing lingers.
        -- Clear the FK reference first so the entry can be deleted safely.
        IF j_id IS NOT NULL THEN
            UPDATE opening_cash SET journal_id = NULL WHERE journal_id = j_id;
            DELETE FROM journallines   WHERE journal_id = j_id;
            DELETE FROM journalentries WHERE journal_id = j_id;
            j_id := NULL;
        END IF;
    END IF;

    IF v_row.opening_cash_id IS NULL THEN
        INSERT INTO opening_cash (amount, entry_date, journal_id, created_by_id)
        VALUES (v_amount, CURRENT_DATE, j_id, v_user);
    ELSE
        UPDATE opening_cash
           SET amount        = v_amount,
               journal_id    = j_id,
               created_by_id = COALESCE(v_user, created_by_id),
               date_updated  = CURRENT_TIMESTAMP
         WHERE opening_cash_id = v_row.opening_cash_id;
    END IF;

    RETURN get_opening_cash_json();
END;
$$;
-- ============================================================
-- Seed: Core Chart of Accounts (system-required foundation)
-- ------------------------------------------------------------
-- The accounting layer (cash balance, trial balance, party
-- opening balances, ledgers, sales/purchase posting, and the
-- Opening Cash feature) all reference these accounts BY NAME.
-- On a fresh database `chartofaccounts` is empty, so these must
-- exist before any accounting action can post.
--
-- These 8 accounts mirror production's core accounts. Expense
-- accounts (EXP-xxxx) are NOT seeded here — they are created
-- automatically when Expense parties are added.
--
-- Idempotent: each account is inserted only if an account with
-- the same (case-insensitive, trimmed) name does not already
-- exist, so it is safe to run more than once.
-- ============================================================

INSERT INTO chartofaccounts (account_code, account_name, account_type)
SELECT v.code, v.name, v.type
FROM (VALUES
    ('1000', 'Cash',                'Asset'),
    ('1200', 'Accounts Receivable', 'Asset'),
    ('1400', 'Inventory',           'Asset'),
    ('2000', 'Accounts Payable',    'Liability'),
    ('3000', 'Owner''s Capital',    'Equity'),
    ('3001', 'Opening Balance',     'Equity'),
    ('4000', 'Sales Revenue',       'Revenue'),
    ('5000', 'Cost of Goods Sold',  'Expense')
) AS v(code, name, type)
WHERE NOT EXISTS (
    SELECT 1 FROM chartofaccounts c
    WHERE TRIM(LOWER(c.account_name)) = TRIM(LOWER(v.name))
);
-----------------------------------------------------------------------
-- ============================================================
-- MONTHLY REPORTS — Pakistan environment rebuild
-- ============================================================
-- 1) monthly_company_position(as_of_date)  -> Balance-sheet style
--      Total Assets, Total Liabilities, Net Position (= Assets - Liabilities)
--      using the accounting equation. Accounts are classified by type;
--      Revenue/Expense accounts are ignored. AR/AP are taken from party
--      balances (matching vw_trial_balance's control-account behaviour).
--
-- 2) monthly_income_statement(from_date, to_date) -> Profit & Loss
--      Profit/Loss = Sales - Purchases - Expenses, all auto-calculated
--      from the data for the period (no manual input). Sales & Purchases
--      are net of returns; Expenses are operating expense accounts
--      (Cost of Goods Sold excluded, since Purchases already captures the
--      cost of inventory bought).
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. COMPANY POSITION (Balance Sheet)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION monthly_company_position(p_as_of_date date DEFAULT CURRENT_DATE)
RETURNS json
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    v_ar_total       NUMERIC(14,2) := 0;
    v_ap_total       NUMERIC(14,2) := 0;
    v_assets_json    json := '[]'::json;
    v_liab_json      json := '[]'::json;
    v_equity_json    json := '[]'::json;
    v_total_assets   NUMERIC(14,2) := 0;
    v_total_liab     NUMERIC(14,2) := 0;
    v_total_equity   NUMERIC(14,2) := 0;
    v_stock_worth    NUMERIC(14,2) := 0;
BEGIN
    -- ── Physical stock on hand AS OF the date (each unit at its purchase cost).
    -- A unit counts if it was purchased on/before the date AND its latest
    -- disposal/re-entry event on/before the date leaves it in stock:
    --   sale or vendor-return = out;  customer sale-return = back in.
    -- The purchase date is only a gate (not part of the in/out ordering),
    -- because some sales are dated on/before their purchase invoice.
    WITH purchased AS (
        SELECT pu.unit_id, pit.unit_price
        FROM   purchaseunits   pu
        JOIN   purchaseitems   pit  ON pit.purchase_item_id   = pu.purchase_item_id
        JOIN   purchaseinvoices pinv ON pinv.purchase_invoice_id = pit.purchase_invoice_id
        WHERE  pinv.invoice_date <= p_as_of_date
    ),
    disp AS (
          SELECT su.unit_id, sinv.invoice_date AS ev_date, 2 AS pri, 'out'::text AS io
          FROM   soldunits   su
          JOIN   salesitems  sit  ON sit.sales_item_id  = su.sales_item_id
          JOIN   salesinvoices sinv ON sinv.sales_invoice_id = sit.sales_invoice_id
          WHERE  sinv.invoice_date <= p_as_of_date
        UNION ALL
          SELECT pu.unit_id, sr.return_date, 3, 'in'
          FROM   salesreturnitems sri
          JOIN   salesreturns     sr ON sr.sales_return_id = sri.sales_return_id
          JOIN   purchaseunits    pu ON pu.serial_number   = sri.serial_number
          WHERE  sr.return_date <= p_as_of_date
        UNION ALL
          SELECT pu.unit_id, pr.return_date, 4, 'out'
          FROM   purchasereturnitems pri
          JOIN   purchasereturns     pr ON pr.purchase_return_id = pri.purchase_return_id
          JOIN   purchaseunits       pu ON pu.serial_number      = pri.serial_number
          WHERE  pr.return_date <= p_as_of_date
    ),
    latest_disp AS (
        SELECT unit_id, io FROM (
            SELECT unit_id, io,
                   ROW_NUMBER() OVER (PARTITION BY unit_id ORDER BY ev_date DESC, pri DESC) rn
            FROM disp
        ) z WHERE rn = 1
    )
    SELECT ROUND(COALESCE(SUM(p.unit_price), 0), 2)
    INTO   v_stock_worth
    FROM   purchased p
    LEFT JOIN latest_disp ld ON ld.unit_id = p.unit_id
    WHERE  COALESCE(ld.io, 'in') = 'in';

    -- Party receivables / payables as of date (exclude expense parties).
    -- A party with a net debit balance is a receivable (asset); net credit
    -- is a payable (liability) — same treatment as the trial-balance view.
    SELECT
        COALESCE(SUM(bal) FILTER (WHERE bal > 0), 0),
        COALESCE(SUM(-bal) FILTER (WHERE bal < 0), 0)
    INTO v_ar_total, v_ap_total
    FROM (
        SELECT p.party_id,
               COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0) AS bal
        FROM   parties p
        JOIN   journallines    jl ON jl.party_id   = p.party_id
        JOIN   journalentries  je ON je.journal_id = jl.journal_id
        WHERE  je.entry_date <= p_as_of_date
          AND  p.party_type NOT ILIKE '%expense%'
        GROUP  BY p.party_id
    ) pb;

    -- ASSETS  (asset-type GL accounts, party_id IS NULL) + AR control
    SELECT
        COALESCE(json_agg(json_build_object('name', name, 'amount', amt)
                          ORDER BY name) FILTER (WHERE amt <> 0), '[]'::json),
        COALESCE(SUM(amt), 0)
    INTO v_assets_json, v_total_assets
    FROM (
        SELECT c.account_name AS name,
               ROUND(COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0), 2) AS amt
        FROM   chartofaccounts c
        LEFT JOIN journallines   jl ON jl.account_id = c.account_id AND jl.party_id IS NULL
        LEFT JOIN journalentries je ON je.journal_id = jl.journal_id
                                   AND je.entry_date <= p_as_of_date
        WHERE  c.account_type = 'Asset'
          AND  c.account_name <> 'Accounts Receivable'
          AND  c.account_name <> 'Inventory'
        GROUP  BY c.account_name
        UNION ALL
        SELECT 'Accounts Receivable', ROUND(v_ar_total, 2)
        UNION ALL
        SELECT 'Inventory', v_stock_worth          -- physical stock on hand as of date
    ) a;

    -- LIABILITIES  (liability-type GL accounts, party_id IS NULL) + AP control
    -- Liability accounts are credit-normal, so the displayed amount is -(debit-credit).
    SELECT
        COALESCE(json_agg(json_build_object('name', name, 'amount', amt)
                          ORDER BY name) FILTER (WHERE amt <> 0), '[]'::json),
        COALESCE(SUM(amt), 0)
    INTO v_liab_json, v_total_liab
    FROM (
        SELECT c.account_name AS name,
               ROUND(-(COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0)), 2) AS amt
        FROM   chartofaccounts c
        LEFT JOIN journallines   jl ON jl.account_id = c.account_id AND jl.party_id IS NULL
        LEFT JOIN journalentries je ON je.journal_id = jl.journal_id
                                   AND je.entry_date <= p_as_of_date
        WHERE  c.account_type = 'Liability'
          AND  c.account_name <> 'Accounts Payable'
          AND  c.account_id NOT IN (
                   SELECT ap_account_id FROM parties
                   WHERE party_type = 'Expense' AND ap_account_id IS NOT NULL
               )
        GROUP  BY c.account_name
        UNION ALL
        SELECT 'Accounts Payable', ROUND(v_ap_total, 2)
    ) l;

    -- EQUITY accounts (reference only; credit-normal -> -(debit-credit))
    SELECT
        COALESCE(json_agg(json_build_object('name', name, 'amount', amt)
                          ORDER BY name) FILTER (WHERE amt <> 0), '[]'::json),
        COALESCE(SUM(amt), 0)
    INTO v_equity_json, v_total_equity
    FROM (
        SELECT c.account_name AS name,
               ROUND(-(COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0)), 2) AS amt
        FROM   chartofaccounts c
        LEFT JOIN journallines   jl ON jl.account_id = c.account_id AND jl.party_id IS NULL
        LEFT JOIN journalentries je ON je.journal_id = jl.journal_id
                                   AND je.entry_date <= p_as_of_date
        WHERE  c.account_type = 'Equity'
        GROUP  BY c.account_name
    ) e;

    RETURN json_build_object(
        'as_of_date',             p_as_of_date,
        'assets',                 v_assets_json,
        'total_assets',           ROUND(v_total_assets, 2),
        'liabilities',            v_liab_json,
        'total_liabilities',      ROUND(v_total_liab, 2),
        'equity_accounts',        v_equity_json,
        'total_equity_accounts',  ROUND(v_total_equity, 2),
        'net_position',           ROUND(v_total_assets - v_total_liab, 2)
    );
END;
$function$;
CREATE OR REPLACE FUNCTION monthly_income_statement(p_from_date date, p_to_date date)
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

    -- Purchases (net of purchase returns) within the period
    SELECT COALESCE(SUM(total_amount), 0) INTO v_purch_gross
    FROM   purchaseinvoices
    WHERE  invoice_date BETWEEN p_from_date AND p_to_date;

    SELECT COALESCE(SUM(total_amount), 0) INTO v_purch_returns
    FROM   purchasereturns
    WHERE  return_date BETWEEN p_from_date AND p_to_date;

    v_total_purchases := v_purch_gross - v_purch_returns;

    -- Operating expenses within the period (expense accounts; COGS excluded
    -- because Purchases already captures the cost of inventory bought).
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
          AND  c.account_name NOT ILIKE '%cost of goods%'   -- already inside (Sales − Purchases); excluding avoids double-count
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
-- ============================================================
-- SEED: Retained Earnings (Equity)
-- ------------------------------------------------------------
-- Adds a single "Retained Earnings" account to the chart of
-- accounts. This is the proper home for accumulated profit:
-- net profit (from the income statement) belongs in equity, not
-- in an expense account.
--
-- Nothing posts to it automatically yet — for the current
-- single-owner setup the balance sheet's Net Position already
-- reflects profit implicitly. When the business is later split
-- between owners, the manual profit-distribution step will debit
-- this account and credit each owner's capital account.
--
-- Safe & idempotent: re-running does nothing if the account
-- already exists. It does not touch any other object, function,
-- view or trigger.
-- ============================================================

INSERT INTO chartofaccounts (account_code, account_name, account_type)
SELECT
    -- first unused numeric code at/above 3002 (Owner's Capital=3000, Opening Balance=3001)
    (SELECT g::text
       FROM generate_series(3002, 3999) g
      WHERE g::text NOT IN (
                SELECT account_code FROM chartofaccounts
                WHERE account_code ~ '^[0-9]+$'
            )
      ORDER BY g
      LIMIT 1),
    'Retained Earnings',
    'Equity'
WHERE NOT EXISTS (
    SELECT 1 FROM chartofaccounts WHERE account_name = 'Retained Earnings'
);
-- ============================================================
-- FEATURE: Owner Equity (Withdrawals & Capital Injections)
-- ------------------------------------------------------------
-- Records owner money movements directly against an equity
-- (capital) account — WITHOUT going through a party, so a
-- withdrawal correctly reduces equity instead of masquerading
-- as a loan/receivable.
--
-- Posted entries (no cash is faked; Cash really moves):
--   Withdrawal: DEBIT  Owner's Capital   / CREDIT Cash
--   Injection : DEBIT  Cash              / CREDIT Owner's Capital
--
-- Effect on the Company Position report:
--   Withdrawal -> Cash down  -> Net Position down by the amount
--   Injection  -> Cash up    -> Net Position up   by the amount
--
-- The equity account is selectable (defaults to "Owner's Capital"),
-- so when per-owner capital accounts are added later, they work
-- automatically. All business tables here are raw SQL / unmanaged
-- by Django, consistent with the rest of the system.
-- ============================================================

CREATE TABLE IF NOT EXISTS owner_equity_transactions (
    txn_id            BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    txn_date          DATE          NOT NULL DEFAULT CURRENT_DATE,
    direction         TEXT          NOT NULL,
    amount            NUMERIC(14,2) NOT NULL,
    equity_account_id BIGINT        NOT NULL,
    journal_id        BIGINT,
    description       TEXT,
    created_by_id     INTEGER,
    date_created      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT owner_equity_direction_chk CHECK (direction IN ('withdrawal','injection')),
    CONSTRAINT owner_equity_amount_pos    CHECK (amount > 0),
    CONSTRAINT owner_equity_account_fk FOREIGN KEY (equity_account_id)
        REFERENCES chartofaccounts (account_id),
    CONSTRAINT owner_equity_journal_fk FOREIGN KEY (journal_id)
        REFERENCES journalentries (journal_id),
    CONSTRAINT owner_equity_user_fk FOREIGN KEY (created_by_id)
        REFERENCES public.auth_user (id)
);
COMMENT ON TABLE owner_equity_transactions IS
    'Owner withdrawals & capital injections posted against an equity account (no party).';
-- ---------- Add a transaction (posts the balanced journal entry) ----------
CREATE OR REPLACE FUNCTION add_owner_equity_txn(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_direction  TEXT    := lower(trim(p_data->>'direction'));
    v_amount     NUMERIC := ROUND(COALESCE((p_data->>'amount')::NUMERIC, 0), 2);
    v_date       DATE    := COALESCE(NULLIF(p_data->>'txn_date','')::DATE, CURRENT_DATE);
    v_acc_name   TEXT    := COALESCE(NULLIF(trim(p_data->>'equity_account'),''), 'Owner''s Capital');
    v_desc       TEXT    := NULLIF(trim(p_data->>'description'), '');
    v_user       INTEGER := NULLIF(p_data->>'created_by_id','')::INTEGER;
    v_cash_acc   BIGINT;
    v_equity_acc BIGINT;
    v_journal    BIGINT;
    v_txn        BIGINT;
BEGIN
    IF v_direction NOT IN ('withdrawal','injection') THEN
        RAISE EXCEPTION 'direction must be withdrawal or injection';
    END IF;
    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'amount must be greater than 0';
    END IF;

    -- Cash account (tolerant match, prefer Asset)
    SELECT account_id INTO v_cash_acc
    FROM   chartofaccounts
    WHERE  TRIM(LOWER(account_name)) = 'cash'
    ORDER  BY (account_type = 'Asset') DESC
    LIMIT  1;
    IF v_cash_acc IS NULL THEN
        RAISE EXCEPTION 'Cash account not found in ChartOfAccounts';
    END IF;

    -- Equity account (must be an Equity-type account)
    SELECT account_id INTO v_equity_acc
    FROM   chartofaccounts
    WHERE  TRIM(LOWER(account_name)) = TRIM(LOWER(v_acc_name))
      AND  account_type = 'Equity'
    LIMIT  1;
    IF v_equity_acc IS NULL THEN
        RAISE EXCEPTION 'Equity account "%" not found (must be an Equity-type account)', v_acc_name;
    END IF;

    -- Journal entry
    INSERT INTO journalentries (entry_date, description)
    VALUES (v_date, COALESCE(v_desc,
                CASE v_direction WHEN 'withdrawal' THEN 'Owner Withdrawal'
                                 ELSE 'Owner Capital Injection' END))
    RETURNING journal_id INTO v_journal;

    IF v_direction = 'withdrawal' THEN
        -- Debit equity (reduce capital) / Credit Cash (cash out)
        INSERT INTO journallines (journal_id, account_id, debit)  VALUES (v_journal, v_equity_acc, v_amount);
        INSERT INTO journallines (journal_id, account_id, credit) VALUES (v_journal, v_cash_acc,   v_amount);
    ELSE
        -- Debit Cash (cash in) / Credit equity (increase capital)
        INSERT INTO journallines (journal_id, account_id, debit)  VALUES (v_journal, v_cash_acc,   v_amount);
        INSERT INTO journallines (journal_id, account_id, credit) VALUES (v_journal, v_equity_acc, v_amount);
    END IF;

    INSERT INTO owner_equity_transactions
        (txn_date, direction, amount, equity_account_id, journal_id, description, created_by_id)
    VALUES (v_date, v_direction, v_amount, v_equity_acc, v_journal, v_desc, v_user)
    RETURNING txn_id INTO v_txn;

    RETURN jsonb_build_object('status','success','txn_id',v_txn,'journal_id',v_journal);
END;
$function$;
-- ---------- List recent transactions + summary ----------
CREATE OR REPLACE FUNCTION get_owner_equity_json(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    v_rows  jsonb;
    v_inj   NUMERIC(14,2);
    v_wd    NUMERIC(14,2);
BEGIN
    SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'txn_date') DESC, (r->>'txn_id')::bigint DESC), '[]'::jsonb)
    INTO   v_rows
    FROM (
        SELECT jsonb_build_object(
                   'txn_id',      t.txn_id,
                   'txn_date',    t.txn_date,
                   'direction',   t.direction,
                   'amount',      t.amount,
                   'account',     c.account_name,
                   'description', t.description
               ) AS r
        FROM   owner_equity_transactions t
        JOIN   chartofaccounts c ON c.account_id = t.equity_account_id
        ORDER  BY t.txn_date DESC, t.txn_id DESC
        LIMIT  GREATEST(p_limit, 0)
    ) z;

    SELECT COALESCE(SUM(amount) FILTER (WHERE direction='injection'), 0),
           COALESCE(SUM(amount) FILTER (WHERE direction='withdrawal'), 0)
    INTO   v_inj, v_wd
    FROM   owner_equity_transactions;

    RETURN jsonb_build_object(
        'transactions',      v_rows,
        'total_injections',  v_inj,
        'total_withdrawals', v_wd,
        'net_contributed',   ROUND(v_inj - v_wd, 2)
    );
END;
$function$;
-- ---------- Delete a transaction (removes its journal entry too) ----------
CREATE OR REPLACE FUNCTION delete_owner_equity_txn(p_txn_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_journal BIGINT;
BEGIN
    SELECT journal_id INTO v_journal
    FROM   owner_equity_transactions WHERE txn_id = p_txn_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status','error','message','Transaction not found');
    END IF;

    -- Clear FK, then remove the journal entry and its lines, then the txn row
    UPDATE owner_equity_transactions SET journal_id = NULL WHERE txn_id = p_txn_id;
    IF v_journal IS NOT NULL THEN
        DELETE FROM journallines   WHERE journal_id = v_journal;
        DELETE FROM journalentries WHERE journal_id = v_journal;
    END IF;
    DELETE FROM owner_equity_transactions WHERE txn_id = p_txn_id;

    RETURN jsonb_build_object('status','success','txn_id',p_txn_id);
END;
$function$;
-- ============================================================
-- FEATURE: Month-End Close (recognise monthly profit -> Retained Earnings)
-- ============================================================
-- Adds period_closes + preview/close/overview/reverse functions.
-- Withdrawals of accumulated profit are done via the Owner Equity feature.
-- ------------------------------------------------------------

-- ============================================================
-- FEATURE: Month-End Close (profit recognition into Retained Earnings)
-- ------------------------------------------------------------
-- Closing a month moves that month's EARNED profit
-- (Sales Revenue - Cost of Goods Sold - Expenses) out of the
-- temporary income/expense accounts and into Retained Earnings,
-- and records it in a month-by-month log.
--
-- Closing entry (dated last day of month, NO cash), e.g. for a
-- month with Sales 60,000 and COGS 50,000:
--     DEBIT  Sales Revenue       60,000   (empties it)
--     CREDIT Cost of Goods Sold  50,000   (empties it)
--     CREDIT Retained Earnings   10,000   (earned profit lands here)
--
-- Rules: one close per month (UNIQUE); period-scoped so order does
-- not matter; reversible; closing entries are tagged
-- ('Month-End Close YYYY-MM') and excluded from profit math so they
-- never double-count. Net Position (Assets - Liabilities) is
-- unchanged by a close. All tables are raw SQL / unmanaged by Django.
-- ============================================================

CREATE TABLE IF NOT EXISTS period_closes (
    close_id        BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    period_year     INTEGER       NOT NULL,
    period_month    INTEGER       NOT NULL,
    profit_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
    sales_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
    cogs_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    expenses_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    journal_id      BIGINT,
    closed_by_id    INTEGER,
    closed_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT period_month_chk  CHECK (period_month BETWEEN 1 AND 12),
    CONSTRAINT period_unique     UNIQUE (period_year, period_month),
    CONSTRAINT period_journal_fk FOREIGN KEY (journal_id)
        REFERENCES journalentries (journal_id),
    CONSTRAINT period_user_fk    FOREIGN KEY (closed_by_id)
        REFERENCES public.auth_user (id)
);
COMMENT ON TABLE period_closes IS
    'Month-end profit recognitions into Retained Earnings (one row per closed month).';
-- ---------- Preview a month's earned-profit breakdown (no posting) ----------
CREATE OR REPLACE FUNCTION preview_period_close(p_year integer, p_month integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    v_start  date;
    v_end    date;
    v_sales  numeric(14,2) := 0;
    v_cogs   numeric(14,2) := 0;
    v_exp    numeric(14,2) := 0;
    v_closed boolean := FALSE;
BEGIN
    IF p_month NOT BETWEEN 1 AND 12 THEN
        RAISE EXCEPTION 'month must be between 1 and 12';
    END IF;
    v_start := make_date(p_year, p_month, 1);
    v_end   := (v_start + INTERVAL '1 month' - INTERVAL '1 day')::date;

    SELECT
        COALESCE(SUM(CASE WHEN c.account_type = 'Revenue'
                          THEN jl.credit - jl.debit END), 0),
        COALESCE(SUM(CASE WHEN c.account_name ILIKE '%cost of goods%'
                          THEN jl.debit - jl.credit END), 0),
        COALESCE(SUM(CASE WHEN c.account_type = 'Expense'
                           AND c.account_name NOT ILIKE '%cost of goods%'
                          THEN jl.debit - jl.credit END), 0)
    INTO v_sales, v_cogs, v_exp
    FROM   journallines   jl
    JOIN   journalentries je ON je.journal_id = jl.journal_id
    JOIN   chartofaccounts c ON c.account_id  = jl.account_id
    WHERE  je.entry_date BETWEEN v_start AND v_end
      AND  c.account_type IN ('Revenue','Expense')
      AND  je.description NOT ILIKE 'Month-End Close%';

    SELECT TRUE INTO v_closed FROM period_closes
    WHERE period_year = p_year AND period_month = p_month;

    RETURN jsonb_build_object(
        'year', p_year, 'month', p_month,
        'sales', v_sales, 'cogs', v_cogs, 'expenses', v_exp,
        'profit', ROUND(v_sales - v_cogs - v_exp, 2),
        'already_closed', COALESCE(v_closed, FALSE)
    );
END;
$function$;
-- ---------- Close a month (posts the balanced closing entry) ----------
CREATE OR REPLACE FUNCTION close_period_from_json(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_year   integer := (p_data->>'year')::integer;
    v_month  integer := (p_data->>'month')::integer;
    v_user   integer := NULLIF(p_data->>'created_by_id','')::integer;
    v_start  date;
    v_end    date;
    v_sales  numeric(14,2) := 0;
    v_cogs   numeric(14,2) := 0;
    v_exp    numeric(14,2) := 0;
    v_profit numeric(14,2) := 0;
    v_re     bigint;
    v_journal bigint;
BEGIN
    IF v_month NOT BETWEEN 1 AND 12 THEN
        RAISE EXCEPTION 'month must be between 1 and 12';
    END IF;
    IF EXISTS (SELECT 1 FROM period_closes
               WHERE period_year = v_year AND period_month = v_month) THEN
        RAISE EXCEPTION 'Period %-% is already closed', v_year,
                        lpad(v_month::text, 2, '0');
    END IF;

    v_start := make_date(v_year, v_month, 1);
    v_end   := (v_start + INTERVAL '1 month' - INTERVAL '1 day')::date;

    SELECT
        COALESCE(SUM(CASE WHEN c.account_type = 'Revenue'
                          THEN jl.credit - jl.debit END), 0),
        COALESCE(SUM(CASE WHEN c.account_name ILIKE '%cost of goods%'
                          THEN jl.debit - jl.credit END), 0),
        COALESCE(SUM(CASE WHEN c.account_type = 'Expense'
                           AND c.account_name NOT ILIKE '%cost of goods%'
                          THEN jl.debit - jl.credit END), 0)
    INTO v_sales, v_cogs, v_exp
    FROM   journallines   jl
    JOIN   journalentries je ON je.journal_id = jl.journal_id
    JOIN   chartofaccounts c ON c.account_id  = jl.account_id
    WHERE  je.entry_date BETWEEN v_start AND v_end
      AND  c.account_type IN ('Revenue','Expense')
      AND  je.description NOT ILIKE 'Month-End Close%';

    v_profit := ROUND(v_sales - v_cogs - v_exp, 2);

    SELECT account_id INTO v_re
    FROM   chartofaccounts
    WHERE  account_name = 'Retained Earnings' AND account_type = 'Equity'
    LIMIT  1;
    IF v_re IS NULL THEN
        RAISE EXCEPTION 'Retained Earnings account not found in ChartOfAccounts';
    END IF;

    INSERT INTO journalentries (entry_date, description)
    VALUES (v_end, 'Month-End Close ' || v_year || '-' || lpad(v_month::text, 2, '0'))
    RETURNING journal_id INTO v_journal;

    -- Reverse each nominal account's period activity (zeroes Revenue/Expense for the month)
    INSERT INTO journallines (journal_id, account_id, debit, credit)
    SELECT v_journal, t.account_id,
           CASE WHEN t.net_dr < 0 THEN -t.net_dr ELSE NULL END,   -- debit clears net-credit (revenue)
           CASE WHEN t.net_dr > 0 THEN  t.net_dr ELSE NULL END    -- credit clears net-debit (expense)
    FROM (
        SELECT jl.account_id, SUM(jl.debit) - SUM(jl.credit) AS net_dr
        FROM   journallines   jl
        JOIN   journalentries je ON je.journal_id = jl.journal_id
        JOIN   chartofaccounts c ON c.account_id  = jl.account_id
        WHERE  je.entry_date BETWEEN v_start AND v_end
          AND  c.account_type IN ('Revenue','Expense')
          AND  je.description NOT ILIKE 'Month-End Close%'
        GROUP  BY jl.account_id
        HAVING SUM(jl.debit) - SUM(jl.credit) <> 0
    ) t;

    -- Balancing line into Retained Earnings
    IF v_profit > 0 THEN
        INSERT INTO journallines (journal_id, account_id, credit)
        VALUES (v_journal, v_re, v_profit);
    ELSIF v_profit < 0 THEN
        INSERT INTO journallines (journal_id, account_id, debit)
        VALUES (v_journal, v_re, -v_profit);
    END IF;

    INSERT INTO period_closes
        (period_year, period_month, profit_amount, sales_amount,
         cogs_amount, expenses_amount, journal_id, closed_by_id)
    VALUES (v_year, v_month, v_profit, v_sales, v_cogs, v_exp, v_journal, v_user);

    RETURN jsonb_build_object('status','success','year',v_year,'month',v_month,
                              'profit',v_profit,'sales',v_sales,'cogs',v_cogs,
                              'expenses',v_exp,'journal_id',v_journal);
END;
$function$;
-- ---------- List closed + open months, plus Retained Earnings balance ----------
CREATE OR REPLACE FUNCTION get_period_closes_json()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    v_closed jsonb;
    v_open   jsonb;
    v_total  numeric(14,2);
    v_re_bal numeric(14,2);
BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'year', period_year, 'month', period_month,
               'profit', profit_amount, 'sales', sales_amount,
               'cogs', cogs_amount, 'expenses', expenses_amount,
               'closed_at', closed_at
           ) ORDER BY period_year DESC, period_month DESC), '[]'::jsonb)
    INTO v_closed FROM period_closes;

    WITH activity AS (
        SELECT DISTINCT EXTRACT(YEAR FROM je.entry_date)::int  AS yr,
                        EXTRACT(MONTH FROM je.entry_date)::int AS mo
        FROM   journallines   jl
        JOIN   journalentries je ON je.journal_id = jl.journal_id
        JOIN   chartofaccounts c ON c.account_id  = jl.account_id
        WHERE  c.account_type IN ('Revenue','Expense')
          AND  je.description NOT ILIKE 'Month-End Close%'
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'year', yr, 'month', mo,
               'profit', (preview_period_close(yr, mo)->>'profit')::numeric
           ) ORDER BY yr DESC, mo DESC), '[]'::jsonb)
    INTO v_open
    FROM activity a
    WHERE NOT EXISTS (SELECT 1 FROM period_closes pc
                      WHERE pc.period_year = a.yr AND pc.period_month = a.mo);

    SELECT COALESCE(SUM(profit_amount), 0) INTO v_total FROM period_closes;

    SELECT COALESCE(balance, 0) INTO v_re_bal
    FROM vw_trial_balance WHERE name = 'Retained Earnings';

    RETURN jsonb_build_object(
        'closed', v_closed,
        'open',   v_open,
        'total_closed_profit', v_total,
        'retained_earnings_balance', ROUND(COALESCE(-v_re_bal, 0), 2)  -- credit-normal -> positive
    );
END;
$function$;
-- ---------- Reverse (un-close) a month ----------
CREATE OR REPLACE FUNCTION reverse_period_close(p_year integer, p_month integer)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_journal bigint;
BEGIN
    SELECT journal_id INTO v_journal FROM period_closes
    WHERE period_year = p_year AND period_month = p_month;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status','error','message','That month is not closed');
    END IF;

    UPDATE period_closes SET journal_id = NULL
    WHERE period_year = p_year AND period_month = p_month;
    IF v_journal IS NOT NULL THEN
        DELETE FROM journallines   WHERE journal_id = v_journal;
        DELETE FROM journalentries WHERE journal_id = v_journal;
    END IF;
    DELETE FROM period_closes
    WHERE period_year = p_year AND period_month = p_month;

    RETURN jsonb_build_object('status','success','year',p_year,'month',p_month);
END;
$function$;
-- ============================================================
-- SALES REPORTS (replaces old Profit Reports section)
-- vw_sold_serial_profit + 8 report functions
-- ============================================================

-- ============================================================
-- SALES REPORTS  (replaces the old Profit Reports section)
-- ------------------------------------------------------------
-- Eight date-range reports built on a shared view of KEPT sold
-- serials (status = 'Sold'); returned serials are excluded
-- everywhere. Revenue is the serial sold_price (reconciles to
-- invoice totals); cost is the serial's actual purchase price;
-- profit = revenue - cost. All functions return jsonb.
-- ============================================================

-- ---------- Shared base: one row per KEPT sold serial ----------
CREATE OR REPLACE VIEW vw_sold_serial_profit AS
SELECT
    s.sales_invoice_id,
    s.invoice_date,
    s.customer_id,
    COALESCE(cust.party_name, 'No customer')::text AS customer_name,
    si.item_id,
    it.item_name::text   AS item_name,
    COALESCE(it.brand, '')::text    AS brand,
    COALESCE(it.category, '')::text AS category,
    COALESCE(it.item_code, '')::text AS item_code,
    pu.serial_number::text  AS serial_number,
    pu.serial_comment::text AS serial_comment,
    su.sold_price           AS revenue,
    COALESCE(pi.unit_price, 0) AS cost,
    (su.sold_price - COALESCE(pi.unit_price, 0)) AS profit,
    vend.party_name::text   AS vendor_name
FROM soldunits su
JOIN salesitems     si  ON si.sales_item_id   = su.sales_item_id
JOIN salesinvoices  s   ON s.sales_invoice_id = si.sales_invoice_id
JOIN items          it  ON it.item_id         = si.item_id
LEFT JOIN parties   cust ON cust.party_id     = s.customer_id
LEFT JOIN purchaseunits pu ON pu.unit_id      = su.unit_id
LEFT JOIN purchaseitems pi ON pi.purchase_item_id = pu.purchase_item_id
LEFT JOIN purchaseinvoices pv ON pv.purchase_invoice_id = pi.purchase_invoice_id
LEFT JOIN parties   vend ON vend.party_id     = pv.vendor_id
WHERE su.status = 'Sold';
-- ============================================================
-- 1. SALES SUMMARY
-- ============================================================
CREATE OR REPLACE FUNCTION sales_summary_json(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $function$
DECLARE
    v_rev numeric := 0; v_cost numeric := 0; v_profit numeric := 0;
    v_inv int := 0; v_units int := 0;
    v_ret_count int := 0; v_ret_value numeric := 0; v_ret_profit numeric := 0;
BEGIN
    SELECT COALESCE(SUM(revenue),0), COALESCE(SUM(cost),0), COALESCE(SUM(profit),0),
           COUNT(DISTINCT sales_invoice_id), COUNT(*)
    INTO v_rev, v_cost, v_profit, v_inv, v_units
    FROM vw_sold_serial_profit
    WHERE invoice_date BETWEEN p_from AND p_to;

    -- Returns activity in the period (by return_date), informational
    SELECT COUNT(DISTINCT sr.sales_return_id),
           COALESCE(SUM(sri.sold_price),0),
           COALESCE(SUM(sri.sold_price - sri.cost_price),0)
    INTO v_ret_count, v_ret_value, v_ret_profit
    FROM salesreturns sr
    JOIN salesreturnitems sri ON sri.sales_return_id = sr.sales_return_id
    WHERE sr.return_date BETWEEN p_from AND p_to;

    RETURN jsonb_build_object(
        'from', p_from, 'to', p_to,
        'net_sales', ROUND(v_rev,2),
        'total_cost', ROUND(v_cost,2),
        'gross_profit', ROUND(v_profit,2),
        'margin_pct', CASE WHEN v_rev>0 THEN ROUND(v_profit/v_rev*100,2) ELSE 0 END,
        'invoice_count', v_inv,
        'units_sold', v_units,
        'avg_invoice', CASE WHEN v_inv>0 THEN ROUND(v_rev/v_inv,2) ELSE 0 END,
        'returns_count', v_ret_count,
        'returns_value', ROUND(v_ret_value,2),
        'returns_profit_impact', ROUND(v_ret_profit,2)
    );
END;
$function$;
-- ============================================================
-- 2. PRODUCT PROFITABILITY  (revenue / cost / profit / margin)
-- ============================================================
CREATE OR REPLACE FUNCTION product_profitability_json(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $function$
DECLARE v_rows jsonb; v_rev numeric; v_cost numeric; v_profit numeric; v_units int;
BEGIN
    SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'profit')::numeric DESC), '[]'::jsonb)
    INTO v_rows FROM (
        SELECT jsonb_build_object(
            'item_name', item_name, 'brand', brand, 'category', category,
            'units', COUNT(*),
            'revenue', ROUND(SUM(revenue),2),
            'cost', ROUND(SUM(cost),2),
            'profit', ROUND(SUM(profit),2),
            'margin_pct', CASE WHEN SUM(revenue)>0 THEN ROUND(SUM(profit)/SUM(revenue)*100,2) ELSE 0 END
        ) AS r
        FROM vw_sold_serial_profit
        WHERE invoice_date BETWEEN p_from AND p_to
        GROUP BY item_id, item_name, brand, category
    ) t;

    SELECT COALESCE(SUM(revenue),0), COALESCE(SUM(cost),0), COALESCE(SUM(profit),0), COUNT(*)
    INTO v_rev, v_cost, v_profit, v_units
    FROM vw_sold_serial_profit WHERE invoice_date BETWEEN p_from AND p_to;

    RETURN jsonb_build_object('from',p_from,'to',p_to,'rows',v_rows,
        'totals', jsonb_build_object('units',v_units,'revenue',ROUND(v_rev,2),
            'cost',ROUND(v_cost,2),'profit',ROUND(v_profit,2),
            'margin_pct', CASE WHEN v_rev>0 THEN ROUND(v_profit/v_rev*100,2) ELSE 0 END));
END;
$function$;
-- ============================================================
-- 3. CUSTOMER PROFITABILITY
-- ============================================================
CREATE OR REPLACE FUNCTION customer_profitability_json(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $function$
DECLARE v_rows jsonb; v_rev numeric; v_cost numeric; v_profit numeric; v_units int;
BEGIN
    SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'profit')::numeric DESC), '[]'::jsonb)
    INTO v_rows FROM (
        SELECT jsonb_build_object(
            'customer_name', customer_name,
            'invoices', COUNT(DISTINCT sales_invoice_id),
            'units', COUNT(*),
            'revenue', ROUND(SUM(revenue),2),
            'cost', ROUND(SUM(cost),2),
            'profit', ROUND(SUM(profit),2),
            'margin_pct', CASE WHEN SUM(revenue)>0 THEN ROUND(SUM(profit)/SUM(revenue)*100,2) ELSE 0 END
        ) AS r
        FROM vw_sold_serial_profit
        WHERE invoice_date BETWEEN p_from AND p_to
        GROUP BY customer_id, customer_name
    ) t;

    SELECT COALESCE(SUM(revenue),0), COALESCE(SUM(cost),0), COALESCE(SUM(profit),0), COUNT(*)
    INTO v_rev, v_cost, v_profit, v_units
    FROM vw_sold_serial_profit WHERE invoice_date BETWEEN p_from AND p_to;

    RETURN jsonb_build_object('from',p_from,'to',p_to,'rows',v_rows,
        'totals', jsonb_build_object('units',v_units,'revenue',ROUND(v_rev,2),
            'cost',ROUND(v_cost,2),'profit',ROUND(v_profit,2),
            'margin_pct', CASE WHEN v_rev>0 THEN ROUND(v_profit/v_rev*100,2) ELSE 0 END));
END;
$function$;
-- ============================================================
-- 4. SALES BY PRODUCT  (volume + revenue, no cost)
-- ============================================================
CREATE OR REPLACE FUNCTION sales_by_product_json(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $function$
DECLARE v_rows jsonb; v_total numeric; v_units int;
BEGIN
    SELECT COALESCE(SUM(revenue),0), COUNT(*) INTO v_total, v_units
    FROM vw_sold_serial_profit WHERE invoice_date BETWEEN p_from AND p_to;

    SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'revenue')::numeric DESC), '[]'::jsonb)
    INTO v_rows FROM (
        SELECT jsonb_build_object(
            'item_name', item_name, 'brand', brand, 'category', category,
            'units', COUNT(*),
            'revenue', ROUND(SUM(revenue),2),
            'pct_of_total', CASE WHEN v_total>0 THEN ROUND(SUM(revenue)/v_total*100,2) ELSE 0 END
        ) AS r
        FROM vw_sold_serial_profit
        WHERE invoice_date BETWEEN p_from AND p_to
        GROUP BY item_id, item_name, brand, category
    ) t;

    RETURN jsonb_build_object('from',p_from,'to',p_to,'rows',v_rows,
        'totals', jsonb_build_object('units',v_units,'revenue',ROUND(v_total,2)));
END;
$function$;
-- ============================================================
-- 5. SALES BY CUSTOMER  (volume + revenue, no cost)
-- ============================================================
CREATE OR REPLACE FUNCTION sales_by_customer_json(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $function$
DECLARE v_rows jsonb; v_total numeric; v_units int;
BEGIN
    SELECT COALESCE(SUM(revenue),0), COUNT(*) INTO v_total, v_units
    FROM vw_sold_serial_profit WHERE invoice_date BETWEEN p_from AND p_to;

    SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'revenue')::numeric DESC), '[]'::jsonb)
    INTO v_rows FROM (
        SELECT jsonb_build_object(
            'customer_name', customer_name,
            'invoices', COUNT(DISTINCT sales_invoice_id),
            'units', COUNT(*),
            'revenue', ROUND(SUM(revenue),2),
            'pct_of_total', CASE WHEN v_total>0 THEN ROUND(SUM(revenue)/v_total*100,2) ELSE 0 END
        ) AS r
        FROM vw_sold_serial_profit
        WHERE invoice_date BETWEEN p_from AND p_to
        GROUP BY customer_id, customer_name
    ) t;

    RETURN jsonb_build_object('from',p_from,'to',p_to,'rows',v_rows,
        'totals', jsonb_build_object('units',v_units,'revenue',ROUND(v_total,2)));
END;
$function$;
-- ============================================================
-- 6. SALE-WISE PROFIT  (per kept serial; returns excluded)
-- ============================================================
CREATE OR REPLACE FUNCTION sale_wise_profit_json(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $function$
DECLARE v_rows jsonb; v_rev numeric; v_cost numeric; v_profit numeric; v_units int;
BEGIN
    SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'sale_date'), (r->>'item_name'), (r->>'serial_number')), '[]'::jsonb)
    INTO v_rows FROM (
        SELECT jsonb_build_object(
            'sale_date', invoice_date,
            'item_name', item_name,
            'serial_number', serial_number,
            'serial_comment', serial_comment,
            'customer_name', customer_name,
            'sale_price', ROUND(revenue,2),
            'purchase_price', ROUND(cost,2),
            'profit_loss', ROUND(profit,2),
            'profit_loss_percent', CASE WHEN cost>0 THEN ROUND(profit/cost*100,2) ELSE NULL END,
            'vendor_name', vendor_name
        ) AS r
        FROM vw_sold_serial_profit
        WHERE invoice_date BETWEEN p_from AND p_to
    ) t;

    SELECT COALESCE(SUM(revenue),0), COALESCE(SUM(cost),0), COALESCE(SUM(profit),0), COUNT(*)
    INTO v_rev, v_cost, v_profit, v_units
    FROM vw_sold_serial_profit WHERE invoice_date BETWEEN p_from AND p_to;

    RETURN jsonb_build_object('from',p_from,'to',p_to,'rows',v_rows,
        'totals', jsonb_build_object('units',v_units,'revenue',ROUND(v_rev,2),
            'cost',ROUND(v_cost,2),'profit',ROUND(v_profit,2),
            'margin_pct', CASE WHEN v_rev>0 THEN ROUND(v_profit/v_rev*100,2) ELSE 0 END));
END;
$function$;
-- ============================================================
-- 7. SALES TREND  (time series; granularity day|week|month)
-- ============================================================
CREATE OR REPLACE FUNCTION sales_trend_json(p_from date, p_to date, p_granularity text DEFAULT 'day')
RETURNS jsonb LANGUAGE plpgsql STABLE AS $function$
DECLARE v_rows jsonb; v_g text;
BEGIN
    v_g := lower(COALESCE(p_granularity,'day'));
    IF v_g NOT IN ('day','week','month') THEN v_g := 'day'; END IF;

    SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'period')), '[]'::jsonb)
    INTO v_rows FROM (
        SELECT jsonb_build_object(
            'period', to_char(date_trunc(v_g, invoice_date), 'YYYY-MM-DD'),
            'revenue', ROUND(SUM(revenue),2),
            'profit', ROUND(SUM(profit),2),
            'units', COUNT(*),
            'invoices', COUNT(DISTINCT sales_invoice_id)
        ) AS r
        FROM vw_sold_serial_profit
        WHERE invoice_date BETWEEN p_from AND p_to
        GROUP BY date_trunc(v_g, invoice_date)
    ) t;

    RETURN jsonb_build_object('from',p_from,'to',p_to,'granularity',v_g,'rows',v_rows);
END;
$function$;
-- ============================================================
-- 8. INVOICE REGISTER  (invoices issued in range)
-- ============================================================
CREATE OR REPLACE FUNCTION invoice_register_json(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $function$
DECLARE v_rows jsonb; v_total numeric; v_count int;
BEGIN
    SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'invoice_date') DESC, (r->>'sales_invoice_id')::bigint DESC), '[]'::jsonb)
    INTO v_rows FROM (
        SELECT jsonb_build_object(
            'sales_invoice_id', s.sales_invoice_id,
            'invoice_date', s.invoice_date,
            'customer_name', COALESCE(cust.party_name,'No customer'),
            'items', (SELECT COUNT(*) FROM salesitems si WHERE si.sales_invoice_id = s.sales_invoice_id),
            'units', (SELECT COALESCE(SUM(si.quantity),0) FROM salesitems si WHERE si.sales_invoice_id = s.sales_invoice_id),
            'total_amount', ROUND(s.total_amount,2)
        ) AS r
        FROM salesinvoices s
        LEFT JOIN parties cust ON cust.party_id = s.customer_id
        WHERE s.invoice_date BETWEEN p_from AND p_to
    ) t;

    SELECT COUNT(*), COALESCE(SUM(total_amount),0) INTO v_count, v_total
    FROM salesinvoices WHERE invoice_date BETWEEN p_from AND p_to;

    RETURN jsonb_build_object('from',p_from,'to',p_to,'rows',v_rows,
        'totals', jsonb_build_object('invoices',v_count,'total_amount',ROUND(v_total,2)));
END;
$function$;
-- ============================================================================
-- CONTRA ENTRY (party-to-party transfer) FEATURE
-- Single balanced entry: Debit To-party (AP control) / Credit From-party (AR control).
-- Mirrors the net of a receipt-from + payment-to, with no Cash movement.
-- ============================================================================

-- ============================================================
-- FEATURE: Contra Entry (party-to-party transfer in one entry)
-- ------------------------------------------------------------
-- Moves a balance directly between two parties without the
-- Cash double-hop. A transfer FROM party A TO party B posts ONE
-- balanced journal entry:
--     DEBIT  B's AP account  (party_id = B)   -- like "pay to B"
--     CREDIT A's AR account  (party_id = A)   -- like "receive from A"
-- Net effect: A's balance goes DOWN, B's balance goes UP, and no
-- Cash is touched -- exactly what a receipt-from-A plus a
-- payment-to-B would net to. Mirrors the Payments/Receipts design
-- (table + AFTER triggers that maintain the journal entry).
-- ============================================================

CREATE TABLE IF NOT EXISTS contra_entries (
    contra_id     BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    from_party_id BIGINT       NOT NULL,           -- credited  (money received from)
    to_party_id   BIGINT       NOT NULL,           -- debited   (money paid to)
    amount        NUMERIC(14,4) NOT NULL,
    contra_date   DATE         NOT NULL DEFAULT CURRENT_DATE,
    method        TEXT         DEFAULT 'Transfer',
    reference_no  TEXT,
    journal_id    BIGINT,
    description   TEXT,
    notes         TEXT,
    created_by    INTEGER,
    date_created  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT contra_diff_parties CHECK (from_party_id <> to_party_id),
    CONSTRAINT contra_amount_pos   CHECK (amount > 0),
    CONSTRAINT contra_from_fk    FOREIGN KEY (from_party_id) REFERENCES parties (party_id) ON DELETE CASCADE,
    CONSTRAINT contra_to_fk      FOREIGN KEY (to_party_id)   REFERENCES parties (party_id) ON DELETE CASCADE,
    CONSTRAINT contra_journal_fk FOREIGN KEY (journal_id)    REFERENCES journalentries (journal_id) ON DELETE SET NULL,
    CONSTRAINT contra_user_fk    FOREIGN KEY (created_by)    REFERENCES public.auth_user (id) ON DELETE SET NULL
);
CREATE SEQUENCE IF NOT EXISTS contra_ref_seq START 1;
COMMENT ON TABLE contra_entries IS
    'Party-to-party transfers (contra). Debit To-party / Credit From-party; no cash.';
-- ---------- Trigger: maintain the journal entry ----------
CREATE OR REPLACE FUNCTION trg_contra_journal()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
    j_id      BIGINT;
    from_acc  BIGINT;
    to_acc    BIGINT;
    from_name TEXT;
    to_name   TEXT;
    journal_desc TEXT;
BEGIN
    -- DELETE: remove the linked journal
    IF TG_OP = 'DELETE' THEN
        DELETE FROM JournalEntries WHERE journal_id = OLD.journal_id;
        RETURN OLD;
    END IF;

    -- UPDATE: skip if nothing relevant changed, else rebuild
    IF TG_OP = 'UPDATE' THEN
        IF OLD.amount = NEW.amount
           AND OLD.from_party_id = NEW.from_party_id
           AND OLD.to_party_id   = NEW.to_party_id
           AND OLD.description IS NOT DISTINCT FROM NEW.description
           AND OLD.contra_date = NEW.contra_date THEN
            RETURN NEW;
        END IF;
        DELETE FROM JournalEntries WHERE journal_id = OLD.journal_id;
    END IF;

    IF TG_OP IN ('INSERT','UPDATE') THEN
        -- From party -> credit side (AR account, like a receipt)
        SELECT ar_account_id, party_name INTO from_acc, from_name
        FROM Parties WHERE party_id = NEW.from_party_id;
        -- To party -> debit side (AP account, like a payment)
        SELECT ap_account_id, party_name INTO to_acc, to_name
        FROM Parties WHERE party_id = NEW.to_party_id;

        IF from_acc IS NULL THEN
            RAISE EXCEPTION 'No AR account found for party %', NEW.from_party_id;
        END IF;
        IF to_acc IS NULL THEN
            RAISE EXCEPTION 'No AP account found for party %', NEW.to_party_id;
        END IF;

        journal_desc := COALESCE(
            NEW.description,
            'Contra: ' || from_name || ' -> ' || to_name ||
            CASE WHEN NEW.reference_no IS NOT NULL AND NEW.reference_no <> ''
                 THEN ' (Ref: ' || NEW.reference_no || ')' ELSE '' END
        );

        INSERT INTO JournalEntries(entry_date, description)
        VALUES (NEW.contra_date, journal_desc)
        RETURNING journal_id INTO j_id;

        -- link back without re-firing this trigger
        PERFORM pg_catalog.set_config('session_replication_role', 'replica', true);
        UPDATE contra_entries SET journal_id = j_id WHERE contra_id = NEW.contra_id;
        PERFORM pg_catalog.set_config('session_replication_role', 'origin', true);

        -- Debit To-party (AP)
        INSERT INTO JournalLines(journal_id, account_id, party_id, debit)
        VALUES (j_id, to_acc, NEW.to_party_id, NEW.amount);
        -- Credit From-party (AR)
        INSERT INTO JournalLines(journal_id, account_id, party_id, credit)
        VALUES (j_id, from_acc, NEW.from_party_id, NEW.amount);
    END IF;

    RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_contra_insert AFTER INSERT ON contra_entries FOR EACH ROW EXECUTE FUNCTION trg_contra_journal();
CREATE TRIGGER trg_contra_update AFTER UPDATE ON contra_entries FOR EACH ROW EXECUTE FUNCTION trg_contra_journal();
CREATE TRIGGER trg_contra_delete AFTER DELETE ON contra_entries FOR EACH ROW EXECUTE FUNCTION trg_contra_journal();
-- ---------- Create ----------
CREATE OR REPLACE FUNCTION make_contra(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE
    v_from BIGINT; v_to BIGINT;
    v_amount NUMERIC(14,4);
    v_desc TEXT; v_date DATE; v_ref TEXT; v_created_by INTEGER; v_id BIGINT;
BEGIN
    v_amount     := (p_data->>'amount')::NUMERIC;
    v_desc       := p_data->>'description';
    v_date       := NULLIF(p_data->>'contra_date','')::DATE;
    v_ref        := p_data->>'reference_no';
    v_created_by := NULLIF(p_data->>'created_by_id','')::INTEGER;

    IF v_amount IS NULL OR v_amount <= 0 THEN
        RAISE EXCEPTION 'Invalid amount: must be > 0';
    END IF;

    SELECT party_id INTO v_from FROM Parties WHERE party_name = p_data->>'from_party_name' LIMIT 1;
    IF v_from IS NULL THEN RAISE EXCEPTION 'From party % not found', p_data->>'from_party_name'; END IF;
    SELECT party_id INTO v_to   FROM Parties WHERE party_name = p_data->>'to_party_name'   LIMIT 1;
    IF v_to IS NULL THEN RAISE EXCEPTION 'To party % not found', p_data->>'to_party_name'; END IF;
    IF v_from = v_to THEN RAISE EXCEPTION 'From and To party cannot be the same'; END IF;

    IF v_ref IS NULL OR v_ref = '' THEN v_ref := 'CON-' || nextval('contra_ref_seq'); END IF;

    INSERT INTO contra_entries(from_party_id, to_party_id, amount, reference_no,
                               description, contra_date, created_by)
    VALUES (v_from, v_to, v_amount, v_ref, v_desc, COALESCE(v_date, CURRENT_DATE), v_created_by)
    RETURNING contra_id INTO v_id;

    RETURN jsonb_build_object('status','success','message','Contra entry created successfully','contra_id', v_id);
END;
$function$;
-- ---------- Update ----------
CREATE OR REPLACE FUNCTION update_contra(p_id bigint, p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE
    v_amount NUMERIC(14,4); v_desc TEXT; v_date DATE; v_ref TEXT;
    v_from BIGINT; v_to BIGINT; v_created_by INTEGER; v_updated RECORD;
BEGIN
    v_amount     := NULLIF(p_data->>'amount','')::NUMERIC;
    v_desc       := NULLIF(p_data->>'description','');
    v_date       := NULLIF(p_data->>'contra_date','')::DATE;
    v_ref        := NULLIF(p_data->>'reference_no','');
    v_created_by := NULLIF(p_data->>'created_by_id','')::INTEGER;

    IF p_data ? 'from_party_name' THEN
        SELECT party_id INTO v_from FROM Parties WHERE party_name = p_data->>'from_party_name' LIMIT 1;
        IF v_from IS NULL THEN RAISE EXCEPTION 'From party % not found', p_data->>'from_party_name'; END IF;
    END IF;
    IF p_data ? 'to_party_name' THEN
        SELECT party_id INTO v_to FROM Parties WHERE party_name = p_data->>'to_party_name' LIMIT 1;
        IF v_to IS NULL THEN RAISE EXCEPTION 'To party % not found', p_data->>'to_party_name'; END IF;
    END IF;
    IF v_amount IS NOT NULL AND v_amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;

    UPDATE contra_entries
    SET amount        = COALESCE(v_amount, amount),
        reference_no  = COALESCE(v_ref, reference_no),
        from_party_id = COALESCE(v_from, from_party_id),
        to_party_id   = COALESCE(v_to, to_party_id),
        description   = COALESCE(v_desc, description),
        contra_date   = COALESCE(v_date, contra_date),
        created_by    = COALESCE(v_created_by, created_by)
    WHERE contra_id = p_id
    RETURNING * INTO v_updated;

    IF NOT FOUND THEN RAISE EXCEPTION 'Contra ID % not found', p_id; END IF;

    RETURN jsonb_build_object('status','success','message','Contra entry updated successfully','contra', to_jsonb(v_updated));
END;
$function$;
-- ---------- Delete ----------
CREATE OR REPLACE FUNCTION delete_contra(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql AS $function$
BEGIN
    DELETE FROM contra_entries WHERE contra_id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Contra ID % not found', p_id; END IF;
    RETURN jsonb_build_object('status','success','message','Contra entry deleted successfully');
END;
$function$;
-- ---------- Fetch one / navigate ----------
CREATE OR REPLACE FUNCTION get_contra_details(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE result JSONB;
BEGIN
    SELECT to_jsonb(c)
        || jsonb_build_object('from_party_name', fp.party_name)
        || jsonb_build_object('to_party_name',   tp.party_name)
        || jsonb_build_object('created_by',       COALESCE(u.username, 'N/A'))
    INTO result
    FROM contra_entries c
    LEFT JOIN Parties fp ON fp.party_id = c.from_party_id
    LEFT JOIN Parties tp ON tp.party_id = c.to_party_id
    LEFT JOIN auth_user u ON u.id = c.created_by
    WHERE c.contra_id = p_id;
    RETURN result;
END;
$function$;
CREATE OR REPLACE FUNCTION get_previous_contra(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE result JSONB;
BEGIN
    SELECT to_jsonb(c)
        || jsonb_build_object('from_party_name', fp.party_name)
        || jsonb_build_object('to_party_name',   tp.party_name)
        || jsonb_build_object('created_by',       COALESCE(u.username, 'N/A'))
    INTO result
    FROM contra_entries c
    LEFT JOIN Parties fp ON fp.party_id = c.from_party_id
    LEFT JOIN Parties tp ON tp.party_id = c.to_party_id
    LEFT JOIN auth_user u ON u.id = c.created_by
    WHERE c.contra_id < p_id
    ORDER BY c.contra_id DESC LIMIT 1;
    RETURN result;
END;
$function$;
CREATE OR REPLACE FUNCTION get_next_contra(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE result JSONB;
BEGIN
    SELECT to_jsonb(c)
        || jsonb_build_object('from_party_name', fp.party_name)
        || jsonb_build_object('to_party_name',   tp.party_name)
        || jsonb_build_object('created_by',       COALESCE(u.username, 'N/A'))
    INTO result
    FROM contra_entries c
    LEFT JOIN Parties fp ON fp.party_id = c.from_party_id
    LEFT JOIN Parties tp ON tp.party_id = c.to_party_id
    LEFT JOIN auth_user u ON u.id = c.created_by
    WHERE c.contra_id > p_id
    ORDER BY c.contra_id ASC LIMIT 1;
    RETURN result;
END;
$function$;
CREATE OR REPLACE FUNCTION get_last_contra()
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE result JSONB;
BEGIN
    SELECT to_jsonb(c)
        || jsonb_build_object('from_party_name', fp.party_name)
        || jsonb_build_object('to_party_name',   tp.party_name)
        || jsonb_build_object('created_by',       COALESCE(u.username, 'N/A'))
    INTO result
    FROM contra_entries c
    LEFT JOIN Parties fp ON fp.party_id = c.from_party_id
    LEFT JOIN Parties tp ON tp.party_id = c.to_party_id
    LEFT JOIN auth_user u ON u.id = c.created_by
    ORDER BY c.contra_id DESC LIMIT 1;
    RETURN result;
END;
$function$;
-- ---------- Lists ----------
CREATE OR REPLACE FUNCTION get_last_20_contras_json(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE result JSONB;
BEGIN
    SELECT jsonb_agg(row_data) INTO result
    FROM (
        SELECT to_jsonb(c)
               || jsonb_build_object('from_party_name', fp.party_name,
                                     'to_party_name',   tp.party_name) AS row_data
        FROM contra_entries c
        JOIN Parties fp ON fp.party_id = c.from_party_id
        JOIN Parties tp ON tp.party_id = c.to_party_id
        ORDER BY c.contra_date DESC, c.contra_id DESC
        LIMIT 20
    ) sub;
    RETURN COALESCE(result, '[]'::jsonb);
END;
$function$;
CREATE OR REPLACE FUNCTION get_contras_by_date_json(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE v_start DATE; v_end DATE; result JSONB;
BEGIN
    v_start := (p_data->>'start_date')::DATE;
    v_end   := (p_data->>'end_date')::DATE;
    IF v_start IS NULL OR v_end IS NULL THEN
        RAISE EXCEPTION 'Both start_date and end_date must be provided';
    END IF;

    SELECT jsonb_agg(to_jsonb(c)
               || jsonb_build_object('from_party_name', fp.party_name,
                                     'to_party_name',   tp.party_name)
               ORDER BY c.contra_date DESC, c.contra_id DESC)
    INTO result
    FROM contra_entries c
    JOIN Parties fp ON fp.party_id = c.from_party_id
    JOIN Parties tp ON tp.party_id = c.to_party_id
    WHERE c.contra_date BETWEEN v_start AND v_end;

    RETURN COALESCE(result, '[]'::jsonb);
END;
$function$;
-- ============================================================================
-- LEDGER: Contra Entry support (Type column + Entry By for contra entries)
-- Must come AFTER contra_entries table is created (above).
-- ============================================================================

-- ============================================================================
-- LEDGER: Contra Entry support
-- Teaches the two ledger functions about contra_entries so that:
--   * Detailed Ledger "Type" column shows "Contra Entry" (not the "Entry" fallback)
--   * "Entry By" column resolves the user who made the contra entry
-- Both functions are CREATE OR REPLACE (identical to the originals except for the
-- added contra branches), so this patch is safe to run on an existing database.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Party Ledger: add contra entries to the author lookup (Entry By column)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION detailed_ledger(p_party_name text, p_start_date date, p_end_date date)
 RETURNS TABLE(entry_date date, journal_id bigint, description text, party_name text, account_type text, debit numeric, credit numeric, running_balance numeric, created_by text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH party_ledger AS (
        SELECT
            je.entry_date                   AS entry_date,
            je.journal_id                   AS journal_id,
            je.description::TEXT            AS description,
            p.party_name::TEXT              AS party_name,
            a.account_name::TEXT            AS account_name,
            jl.debit                        AS debit,
            jl.credit                       AS credit,
            (jl.debit - jl.credit)          AS amount
        FROM JournalLines jl
        JOIN JournalEntries je  ON jl.journal_id  = je.journal_id
        JOIN ChartOfAccounts a  ON jl.account_id  = a.account_id
        LEFT JOIN Parties p     ON jl.party_id    = p.party_id
        WHERE p.party_name = p_party_name
          AND je.entry_date BETWEEN p_start_date AND p_end_date
    ),
    -- Map each journal_id to the user who created the source document
    journal_author AS (
        SELECT pi.journal_id, u.username::TEXT
        FROM purchaseinvoices pi LEFT JOIN auth_user u ON u.id = pi.created_by
        WHERE pi.journal_id IS NOT NULL
        UNION ALL
        SELECT pr.journal_id, u.username::TEXT
        FROM purchasereturns pr LEFT JOIN auth_user u ON u.id = pr.created_by
        WHERE pr.journal_id IS NOT NULL
        UNION ALL
        SELECT si.journal_id, u.username::TEXT
        FROM salesinvoices si LEFT JOIN auth_user u ON u.id = si.created_by
        WHERE si.journal_id IS NOT NULL
        UNION ALL
        SELECT sr.journal_id, u.username::TEXT
        FROM salesreturns sr LEFT JOIN auth_user u ON u.id = sr.created_by
        WHERE sr.journal_id IS NOT NULL
        UNION ALL
        SELECT r.journal_id, u.username::TEXT
        FROM receipts r LEFT JOIN auth_user u ON u.id = r.created_by
        WHERE r.journal_id IS NOT NULL
        UNION ALL
        SELECT py.journal_id, u.username::TEXT
        FROM payments py LEFT JOIN auth_user u ON u.id = py.created_by
        WHERE py.journal_id IS NOT NULL
        UNION ALL
        SELECT ce.journal_id, u.username::TEXT
        FROM contra_entries ce LEFT JOIN auth_user u ON u.id = ce.created_by
        WHERE ce.journal_id IS NOT NULL
    )
    SELECT
        pl.entry_date,
        pl.journal_id,
        pl.description,
        pl.party_name,
        pl.account_name                                                 AS account_type,
        pl.debit,
        pl.credit,
        SUM(pl.amount) OVER (ORDER BY pl.entry_date, pl.journal_id
                             ROWS UNBOUNDED PRECEDING)                  AS running_balance,
        COALESCE(ja.username::TEXT, 'N/A')                              AS created_by
    FROM party_ledger pl
    LEFT JOIN journal_author ja ON ja.journal_id = pl.journal_id
    ORDER BY pl.entry_date, pl.journal_id;
END;
$function$;
-- ---------------------------------------------------------------------------
-- Detailed Ledger: add contra entries to source-type (Type column = "Contra
-- Entry"), the expandable detail panel, and the author lookup (Entry By).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION detailed_ledger2(p_party_name text, p_start_date date, p_end_date date)
 RETURNS TABLE(entry_date date, journal_id bigint, description text, party_name text, account_type text, debit numeric, credit numeric, running_balance numeric, invoice_details jsonb, created_by text)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_opening_balance NUMERIC;
BEGIN
    -- Opening balance: sum of (debit - credit) before p_start_date
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
    INTO   v_opening_balance
    FROM   journallines jl
    JOIN   journalentries je ON jl.journal_id = je.journal_id
    JOIN   parties p         ON jl.party_id   = p.party_id
    WHERE  p.party_name = p_party_name
      AND  je.entry_date < p_start_date;

    RETURN QUERY
    WITH party_ledger AS (
        SELECT
            je.entry_date                   AS entry_date,
            je.journal_id                   AS journal_id,
            je.description::TEXT            AS description,
            p.party_name::TEXT              AS party_name,
            a.account_name::TEXT            AS account_name,
            jl.debit                        AS debit,
            jl.credit                       AS credit,
            (jl.debit - jl.credit)          AS amount
        FROM journallines jl
        JOIN journalentries je  ON jl.journal_id   = je.journal_id
        JOIN chartofaccounts a  ON jl.account_id   = a.account_id
        LEFT JOIN parties p     ON jl.party_id     = p.party_id
        WHERE p.party_name = p_party_name
          AND je.entry_date BETWEEN p_start_date AND p_end_date
    ),

    journal_source AS (
        SELECT pi.journal_id, 'purchase'::TEXT        AS source_type, pi.purchase_invoice_id  AS source_id FROM purchaseinvoices pi  WHERE pi.journal_id IS NOT NULL
        UNION ALL
        SELECT pr.journal_id, 'purchase_return'::TEXT AS source_type, pr.purchase_return_id   AS source_id FROM purchasereturns pr   WHERE pr.journal_id IS NOT NULL
        UNION ALL
        SELECT si.journal_id, 'sale'::TEXT            AS source_type, si.sales_invoice_id     AS source_id FROM salesinvoices si     WHERE si.journal_id IS NOT NULL
        UNION ALL
        SELECT sr.journal_id, 'sale_return'::TEXT     AS source_type, sr.sales_return_id      AS source_id FROM salesreturns sr      WHERE sr.journal_id IS NOT NULL
        UNION ALL
        SELECT r.journal_id,  'receipt'::TEXT         AS source_type, r.receipt_id            AS source_id FROM receipts r           WHERE r.journal_id  IS NOT NULL
        UNION ALL
        SELECT py.journal_id, 'payment'::TEXT         AS source_type, py.payment_id           AS source_id FROM payments py          WHERE py.journal_id IS NOT NULL
        UNION ALL
        SELECT ce.journal_id, 'contra'::TEXT          AS source_type, ce.contra_id            AS source_id FROM contra_entries ce    WHERE ce.journal_id IS NOT NULL
    ),

    -- Resolve username from the source document table
    journal_author AS (
        SELECT pi.journal_id, u.username::TEXT
        FROM purchaseinvoices pi LEFT JOIN auth_user u ON u.id = pi.created_by
        WHERE pi.journal_id IS NOT NULL
        UNION ALL
        SELECT pr.journal_id, u.username::TEXT
        FROM purchasereturns pr LEFT JOIN auth_user u ON u.id = pr.created_by
        WHERE pr.journal_id IS NOT NULL
        UNION ALL
        SELECT si.journal_id, u.username::TEXT
        FROM salesinvoices si LEFT JOIN auth_user u ON u.id = si.created_by
        WHERE si.journal_id IS NOT NULL
        UNION ALL
        SELECT sr.journal_id, u.username::TEXT
        FROM salesreturns sr LEFT JOIN auth_user u ON u.id = sr.created_by
        WHERE sr.journal_id IS NOT NULL
        UNION ALL
        SELECT r.journal_id, u.username::TEXT
        FROM receipts r LEFT JOIN auth_user u ON u.id = r.created_by
        WHERE r.journal_id IS NOT NULL
        UNION ALL
        SELECT py.journal_id, u.username::TEXT
        FROM payments py LEFT JOIN auth_user u ON u.id = py.created_by
        WHERE py.journal_id IS NOT NULL
        UNION ALL
        SELECT ce.journal_id, u.username::TEXT
        FROM contra_entries ce LEFT JOIN auth_user u ON u.id = ce.created_by
        WHERE ce.journal_id IS NOT NULL
    )

    SELECT
        pl.entry_date,
        pl.journal_id,
        pl.description,
        pl.party_name,
        pl.account_name                                                 AS account_type,
        pl.debit,
        pl.credit,
        v_opening_balance + SUM(pl.amount) OVER (
            ORDER BY pl.entry_date, pl.journal_id
            ROWS UNBOUNDED PRECEDING
        )                                                               AS running_balance,

        -- invoice_details
        CASE js.source_type
            WHEN 'purchase' THEN (
                SELECT to_jsonb(d) FROM (
                    SELECT 'Purchase Invoice' AS type, pi.purchase_invoice_id, pa.party_name AS vendor, pi.invoice_date, pi.total_amount,
                        (SELECT json_agg(json_build_object('item_name',i.item_name,'qty',pit.quantity,'unit_price',pit.unit_price,'line_total',pit.quantity*pit.unit_price,
                            'serials',(SELECT json_agg(json_build_object('serial',pu.serial_number,'comment',pu.serial_comment)) FROM purchaseunits pu WHERE pu.purchase_item_id=pit.purchase_item_id)))
                         FROM purchaseitems pit JOIN items i ON i.item_id=pit.item_id WHERE pit.purchase_invoice_id=pi.purchase_invoice_id) AS items
                    FROM purchaseinvoices pi JOIN parties pa ON pa.party_id=pi.vendor_id WHERE pi.purchase_invoice_id=js.source_id
                ) d
            )
            WHEN 'purchase_return' THEN (
                SELECT to_jsonb(d) FROM (
                    SELECT 'Purchase Return' AS type, pr.purchase_return_id, pa.party_name AS vendor, pr.return_date, pr.total_amount,
                        (SELECT json_agg(json_build_object('item_name',i.item_name,'unit_price',pri.unit_price,'serial_number',pri.serial_number))
                         FROM purchasereturnitems pri JOIN items i ON i.item_id=pri.item_id WHERE pri.purchase_return_id=pr.purchase_return_id) AS items
                    FROM purchasereturns pr JOIN parties pa ON pa.party_id=pr.vendor_id WHERE pr.purchase_return_id=js.source_id
                ) d
            )
            WHEN 'sale' THEN (
                SELECT to_jsonb(d) FROM (
                    SELECT 'Sale Invoice' AS type, si.sales_invoice_id, pa.party_name AS customer, si.invoice_date, si.total_amount,
                        (SELECT json_agg(json_build_object('item_name',i.item_name,'qty',sitm.quantity,'unit_price',sitm.unit_price,'line_total',sitm.quantity*sitm.unit_price,
                            'serials',(SELECT json_agg(json_build_object('serial',pu.serial_number,'comment',pu.serial_comment,'sold_price',su.sold_price))
                                       FROM soldunits su JOIN purchaseunits pu ON su.unit_id=pu.unit_id WHERE su.sales_item_id=sitm.sales_item_id)))
                         FROM salesitems sitm JOIN items i ON i.item_id=sitm.item_id WHERE sitm.sales_invoice_id=si.sales_invoice_id) AS items
                    FROM salesinvoices si JOIN parties pa ON pa.party_id=si.customer_id WHERE si.sales_invoice_id=js.source_id
                ) d
            )
            WHEN 'sale_return' THEN (
                SELECT to_jsonb(d) FROM (
                    SELECT 'Sale Return' AS type, sr.sales_return_id, pa.party_name AS customer, sr.return_date, sr.total_amount,
                        (SELECT json_agg(json_build_object('item_name',i.item_name,'sold_price',sri.sold_price,'cost_price',sri.cost_price,'serial_number',sri.serial_number))
                         FROM salesreturnitems sri JOIN items i ON i.item_id=sri.item_id WHERE sri.sales_return_id=sr.sales_return_id) AS items
                    FROM salesreturns sr JOIN parties pa ON pa.party_id=sr.customer_id WHERE sr.sales_return_id=js.source_id
                ) d
            )
            WHEN 'receipt' THEN (
                SELECT to_jsonb(d) FROM (
                    SELECT 'Receipt' AS type, r.receipt_id, pa.party_name AS party, r.receipt_date, r.amount, r.method, r.reference_no, r.notes, r.description
                    FROM receipts r JOIN parties pa ON pa.party_id=r.party_id WHERE r.receipt_id=js.source_id
                ) d
            )
            WHEN 'payment' THEN (
                SELECT to_jsonb(d) FROM (
                    SELECT 'Payment' AS type, py.payment_id, pa.party_name AS party, py.payment_date, py.amount, py.method, py.reference_no, py.notes, py.description
                    FROM payments py JOIN parties pa ON pa.party_id=py.party_id WHERE py.payment_id=js.source_id
                ) d
            )
            WHEN 'contra' THEN (
                SELECT to_jsonb(d) FROM (
                    SELECT 'Contra Entry' AS type, ce.contra_id, fp.party_name AS from_party, tp.party_name AS to_party,
                           ce.contra_date, ce.amount, ce.method, ce.reference_no, ce.description
                    FROM contra_entries ce
                    JOIN parties fp ON fp.party_id = ce.from_party_id
                    JOIN parties tp ON tp.party_id = ce.to_party_id
                    WHERE ce.contra_id = js.source_id
                ) d
            )
            ELSE NULL
        END                                                             AS invoice_details,

        COALESCE(ja.username::TEXT, 'N/A')                              AS created_by

    FROM party_ledger pl
    LEFT JOIN journal_source js  ON js.journal_id  = pl.journal_id
    LEFT JOIN journal_author ja  ON ja.journal_id  = pl.journal_id
    ORDER BY pl.entry_date, pl.journal_id;

END;
$function$;
-- ============================================================================


-- ============================================================================


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
ALTER TABLE purchaseinvoices
    ADD COLUMN IF NOT EXISTS is_opening boolean NOT NULL DEFAULT false;
-- ---------------------------------------------------------------------------
-- 2. System placeholder vendor, used only when an opening-stock load is
--    entered without a reference vendor (vendor_id is NOT NULL).
--    It never receives journal lines, so it always has a zero balance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_opening_stock_vendor_id()
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
CREATE OR REPLACE FUNCTION create_opening_stock(data jsonb)
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
CREATE OR REPLACE FUNCTION get_opening_stock_loads_json()
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
CREATE OR REPLACE FUNCTION get_opening_stock_load_details(p_id bigint)
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
CREATE OR REPLACE FUNCTION delete_opening_stock(p_id bigint)
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
CREATE OR REPLACE FUNCTION get_opening_balance_status_json()
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
CREATE OR REPLACE FUNCTION reclassify_opening_balance_to_capital(data jsonb)
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
-- 7. Keep opening-stock documents out of the operational Purchases section.
--    Each function below is the original with a single is_opening filter added.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_last_purchase_id()
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
CREATE OR REPLACE FUNCTION get_last_purchase()
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
CREATE OR REPLACE FUNCTION get_next_purchase(p_invoice_id bigint)
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
CREATE OR REPLACE FUNCTION get_previous_purchase(p_invoice_id bigint)
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
CREATE OR REPLACE FUNCTION get_current_purchase(p_invoice_id bigint)
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
CREATE OR REPLACE FUNCTION get_purchase_summary(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
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
CREATE OR REPLACE FUNCTION monthly_income_statement(p_from_date date, p_to_date date)
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
CREATE OR REPLACE FUNCTION fn_dash_top_vendors(p_limit integer DEFAULT 5, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
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
CREATE OR REPLACE FUNCTION fn_dash_recent_transactions(p_limit integer DEFAULT 10)
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
