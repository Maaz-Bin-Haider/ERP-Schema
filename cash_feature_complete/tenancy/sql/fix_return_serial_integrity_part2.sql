-- fix_return_serial_integrity_part2.sql
-- ============================================================================
-- Follow-up to fix_return_serial_integrity.sql. Two more places resolved a
-- serial against its STALE sale history instead of its currently-active sale:
--
-- 1) get_serial_number_details(serial)
--    It LEFT JOINed every SoldUnits row for the unit, so a serial with a
--    sell -> return -> sell history returned MULTIPLE rows. The sale-return view
--    reads customer_name via fetchone() and got an arbitrary (old) row, so a
--    serial currently sold on a Cash Sale was reported as still sold to the
--    ORIGINAL customer -> "was sold to (...), not to Cash Sale" on a valid
--    return. Now returns exactly ONE row, preferring the active ('Sold') unit.
--
-- 2) delete_sale_return(p_return_id)
--    Its reversal did  UPDATE SoldUnits SET status='Sold' WHERE unit_id = (...)
--    which flipped EVERY historical row for the unit, corrupting the history.
--    Now it flips only the specific (newest 'Returned') row, and refuses to
--    delete a return whose serial has since been re-sold (which would oversell).
--
-- delete_purchase_return is already correct (PurchaseUnits is 1:1 per serial,
-- with a vendor safety check). Idempotent. Apply with:
--   python manage.py apply_sql_all_tenants tenancy/sql/fix_return_serial_integrity_part2.sql
-- ============================================================================

-- 1) get_serial_number_details: one row, prefer the active sale --------------
CREATE OR REPLACE FUNCTION get_serial_number_details(serial text)
RETURNS TABLE(serial_number character varying, item_name character varying, brand character varying,
              category character varying, purchase_invoice_id bigint, vendor_name character varying,
              purchase_date date, purchase_price numeric, in_stock boolean, sales_invoice_id bigint,
              customer_name character varying, sale_date date, sold_price numeric, current_status character varying)
    LANGUAGE plpgsql AS $$
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
    -- Only ONE sold-unit row: the active 'Sold' one if present, else the newest.
    LEFT JOIN LATERAL (
        SELECT su2.sales_item_id, su2.sold_price, su2.status
        FROM SoldUnits su2
        WHERE su2.unit_id = pu.unit_id
        ORDER BY (su2.status = 'Sold') DESC, su2.sold_unit_id DESC
        LIMIT 1
    ) su ON TRUE
    LEFT JOIN SalesItems si_itm ON su.sales_item_id = si_itm.sales_item_id
    LEFT JOIN SalesInvoices si ON si_itm.sales_invoice_id = si.sales_invoice_id
    LEFT JOIN Parties c ON si.customer_id = c.party_id
    WHERE pu.serial_number = serial;
END; $$;

-- 2) delete_sale_return: precise reverse + re-sold guard ---------------------
CREATE OR REPLACE FUNCTION delete_sale_return(p_return_id bigint) RETURNS void
    LANGUAGE plpgsql AS $$
DECLARE
    rec RECORD;
    v_journal_id BIGINT;
BEGIN
    -- 1. Revert each returned unit back to its sale
    FOR rec IN
        SELECT sri.serial_number, sri.item_id
        FROM SalesReturnItems sri
        WHERE sri.sales_return_id = p_return_id
    LOOP
        -- Refuse if the serial has since been re-sold (an active 'Sold' row
        -- exists) — undoing the return would create a second active sale.
        IF EXISTS (
            SELECT 1 FROM SoldUnits su
            JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
            WHERE pu.serial_number = rec.serial_number AND su.status = 'Sold'
        ) THEN
            RAISE EXCEPTION 'Cannot delete this sale return: serial % has since been re-sold. Reverse the later sale first.', rec.serial_number;
        END IF;

        -- Flip ONLY the newest 'Returned' row (the one this return created) back to 'Sold'
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
        VALUES (rec.item_id, rec.serial_number, 'OUT', 'SalesReturn-Delete', p_return_id, 1);
    END LOOP;

    -- 2. Remove journal (if exists)
    SELECT journal_id INTO v_journal_id FROM SalesReturns WHERE sales_return_id = p_return_id;
    IF v_journal_id IS NOT NULL THEN
        DELETE FROM JournalEntries WHERE journal_id = v_journal_id;
    END IF;

    -- 3. Delete return items + header
    DELETE FROM SalesReturnItems WHERE sales_return_id = p_return_id;
    DELETE FROM SalesReturns WHERE sales_return_id = p_return_id;
END; $$;
