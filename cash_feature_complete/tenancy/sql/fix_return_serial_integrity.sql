-- fix_return_serial_integrity.sql
-- ============================================================================
-- Data-integrity fix for serial returns.
--
-- BUG (sale return): create_sale_return looked up a serial with
--   "WHERE pu.serial_number = v_serial"  -- no status filter, no ordering
-- A serial accumulates MANY SoldUnits rows over its sell -> return -> sell
-- history. The unfiltered lookup grabbed an arbitrary (stale) row, so a serial
-- currently sold on a *cash* sale could be "returned" against the ORIGINAL
-- credit customer, saving a bogus return at the OLD price and wrongly flagging
-- the unit back in stock while the active sale still holds it.
--
-- FIX: every return lookup now targets only the CURRENTLY-ACTIVE unit:
--   * sale returns     -> the SoldUnits row with status='Sold' (newest), and the
--                         return's customer must match that active sale.
--   * purchase returns -> the PurchaseUnits row for THIS vendor that is
--                         in_stock=TRUE (can't return a serial a customer holds,
--                         or double-return one).
-- The update_* variants get the same guards plus a precise reverse step.
--
-- Pure logic fix: signatures, journals and accounting are unchanged. Idempotent.
-- Apply with:
--   python manage.py apply_sql_all_tenants tenancy/sql/fix_return_serial_integrity.sql
-- ============================================================================

-- 1) CREATE SALE RETURN -------------------------------------------------------
CREATE OR REPLACE FUNCTION create_sale_return(p_party_name text, p_serials jsonb, p_created_by integer DEFAULT NULL::integer) RETURNS bigint
    LANGUAGE plpgsql AS $$
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
        -- Only the currently-active sale of this serial (status='Sold'), newest first.
        SELECT su.sold_unit_id, su.unit_id, su.sold_price, si.item_id,
               si.sales_invoice_id, pu.serial_number, pi2.unit_price, s.customer_id
        INTO v_unit
        FROM SoldUnits su
        JOIN SalesItems si ON su.sales_item_id = si.sales_item_id
        JOIN SalesInvoices s ON si.sales_invoice_id = s.sales_invoice_id
        JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
        JOIN PurchaseItems pi2 ON pu.purchase_item_id = pi2.purchase_item_id
        WHERE pu.serial_number = v_serial
          AND su.status = 'Sold'
        ORDER BY su.sold_unit_id DESC
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Serial % is not currently sold (nothing to return)', v_serial;
        END IF;
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
END; $$;

-- 2) UPDATE SALE RETURN -------------------------------------------------------
CREATE OR REPLACE FUNCTION update_sale_return(p_return_id bigint, p_serials jsonb, p_created_by integer DEFAULT NULL::integer) RETURNS void
    LANGUAGE plpgsql AS $$
DECLARE
    rec           RECORD;
    v_serial      TEXT;
    v_unit        RECORD;
    v_total       NUMERIC(14,2) := 0;
    v_cost        NUMERIC(14,2) := 0;
    v_customer_id BIGINT;
BEGIN
    -- Reverse old items: flip ONLY the specific Returned row this return created
    -- (newest Returned row for the serial), not every SoldUnits row for the unit.
    FOR rec IN
        SELECT serial_number, item_id
        FROM SalesReturnItems
        WHERE sales_return_id = p_return_id
    LOOP
        UPDATE SoldUnits SET status = 'Sold'
        WHERE sold_unit_id = (
            SELECT su2.sold_unit_id
            FROM SoldUnits su2
            JOIN PurchaseUnits pu2 ON su2.unit_id = pu2.unit_id
            WHERE pu2.serial_number = rec.serial_number
              AND su2.status = 'Returned'
            ORDER BY su2.sold_unit_id DESC
            LIMIT 1
        );

        UPDATE PurchaseUnits SET in_stock = FALSE WHERE serial_number = rec.serial_number;

        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (rec.item_id, rec.serial_number, 'OUT', 'SalesReturn-Update-Reverse', p_return_id, 1);
    END LOOP;

    DELETE FROM SalesReturnItems WHERE sales_return_id = p_return_id;

    SELECT customer_id INTO v_customer_id FROM SalesReturns WHERE sales_return_id = p_return_id;

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
          AND su.status = 'Sold'
        ORDER BY su.sold_unit_id DESC
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Serial % is not currently sold (nothing to return)', v_serial;
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

    UPDATE SalesReturns
    SET total_amount = v_total,
        created_by   = COALESCE(p_created_by, created_by)
    WHERE sales_return_id = p_return_id;

    PERFORM rebuild_sales_return_journal(p_return_id);
END; $$;

-- 3) CREATE PURCHASE RETURN ---------------------------------------------------
CREATE OR REPLACE FUNCTION create_purchase_return(p_party_name text, p_serials jsonb, p_created_by integer DEFAULT NULL::integer) RETURNS bigint
    LANGUAGE plpgsql AS $$
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
        -- This vendor's unit for the serial, and only if still in stock
        -- (not currently sold to a customer, not already returned).
        SELECT pu.unit_id, pu.purchase_item_id, pi2.unit_price, pi2.item_id,
               pi2.purchase_invoice_id, pu.serial_number
        INTO v_rec
        FROM PurchaseUnits pu
        JOIN PurchaseItems pi2 ON pu.purchase_item_id = pi2.purchase_item_id
        JOIN PurchaseInvoices pinv ON pi2.purchase_invoice_id = pinv.purchase_invoice_id
        WHERE pu.serial_number = v_serial
          AND pinv.vendor_id = v_vendor_id
          AND pu.in_stock = TRUE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Serial % not found for this vendor or not currently in stock', v_serial;
        END IF;

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
END; $$;

-- 4) UPDATE PURCHASE RETURN ---------------------------------------------------
CREATE OR REPLACE FUNCTION update_purchase_return(p_return_id bigint, p_serials jsonb, p_created_by integer DEFAULT NULL::integer) RETURNS void
    LANGUAGE plpgsql AS $$
DECLARE
    rec         RECORD;
    v_serial    TEXT;
    v_unit      RECORD;
    v_total     NUMERIC(14,2) := 0;
    v_vendor_id BIGINT;
BEGIN
    SELECT vendor_id INTO v_vendor_id FROM PurchaseReturns WHERE purchase_return_id = p_return_id;
    IF v_vendor_id IS NULL THEN
        RAISE EXCEPTION 'Purchase Return % not found', p_return_id;
    END IF;

    -- Reverse old items (restore stock)
    FOR rec IN
        SELECT serial_number, item_id
        FROM PurchaseReturnItems
        WHERE purchase_return_id = p_return_id
    LOOP
        UPDATE PurchaseUnits SET in_stock = TRUE WHERE serial_number = rec.serial_number;

        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (rec.item_id, rec.serial_number, 'IN', 'PurchaseReturn-Update-Reverse', p_return_id, 1);
    END LOOP;

    DELETE FROM PurchaseReturnItems WHERE purchase_return_id = p_return_id;

    FOR v_serial IN SELECT jsonb_array_elements_text(p_serials)
    LOOP
        -- This vendor's unit for the serial, and only if still in stock.
        SELECT pu.unit_id, pu.serial_number, pi.item_id, pi.unit_price, p.vendor_id
        INTO v_unit
        FROM PurchaseUnits pu
        JOIN PurchaseItems pi     ON pu.purchase_item_id = pi.purchase_item_id
        JOIN PurchaseInvoices p   ON pi.purchase_invoice_id = p.purchase_invoice_id
        WHERE pu.serial_number = v_serial
          AND p.vendor_id = v_vendor_id
          AND pu.in_stock = TRUE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Serial % not found for this vendor or not currently in stock', v_serial;
        END IF;

        UPDATE PurchaseUnits SET in_stock = FALSE WHERE unit_id = v_unit.unit_id;

        INSERT INTO StockMovements(item_id, serial_number, movement_type, reference_type, reference_id, quantity)
        VALUES (v_unit.item_id, v_serial, 'OUT', 'PurchaseReturn-Update', p_return_id, 1);

        INSERT INTO PurchaseReturnItems(purchase_return_id, item_id, unit_price, serial_number)
        VALUES (p_return_id, v_unit.item_id, v_unit.unit_price, v_serial);

        v_total := v_total + v_unit.unit_price;
    END LOOP;

    UPDATE PurchaseReturns
    SET total_amount = v_total,
        created_by   = COALESCE(p_created_by, created_by)
    WHERE purchase_return_id = p_return_id;

    PERFORM rebuild_purchase_return_journal(p_return_id);
END; $$;
