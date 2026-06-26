-- add_invoice_description.sql
-- ============================================================================
-- Feature: user-entered description on Sale / Purchase / Sale-Return /
--          Purchase-Return invoices.
--
-- The four invoice tables had no description column (unlike payments/receipts).
-- This adds one and repoints the get_current_* read functions to return the
-- user's description (instead of the auto-generated journal-entry description),
-- so a saved description round-trips back into the entry form.
--
-- The auto-sequencing / journal logic is untouched: the create/update stored
-- functions still generate invoices exactly as before; the description is set
-- by the view immediately afterwards.
--
-- Idempotent. Apply to existing tenants with:
--   python manage.py apply_sql_all_tenants tenancy/sql/add_invoice_description.sql
-- ============================================================================

-- 1) New columns -------------------------------------------------------------
ALTER TABLE salesinvoices    ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE purchaseinvoices ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE salesreturns     ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE purchasereturns  ADD COLUMN IF NOT EXISTS description text;

-- 2) Read functions: return the invoice's own description --------------------

CREATE OR REPLACE FUNCTION get_current_sale(p_invoice_id bigint) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE result JSON;
BEGIN
    SELECT json_build_object(
        'sales_invoice_id', si.sales_invoice_id,
        'Party',            p.party_name,
        'invoice_date',     si.invoice_date,
        'total_amount',     si.total_amount,
        'description',      si.description,
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
    LEFT JOIN auth_user u ON u.id = si.created_by
    WHERE si.sales_invoice_id = p_invoice_id;
    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION get_current_purchase(p_invoice_id bigint)
 RETURNS json LANGUAGE plpgsql AS $function$
DECLARE result JSON;
BEGIN
    SELECT json_build_object(
        'purchase_invoice_id', pi.purchase_invoice_id,
        'Party',               p.party_name,
        'invoice_date',        pi.invoice_date,
        'total_amount',        pi.total_amount,
        'description',         pi.description,
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
    LEFT JOIN auth_user u ON u.id = pi.created_by
    WHERE pi.purchase_invoice_id = p_invoice_id
      AND NOT COALESCE(pi.is_opening, false);
    RETURN result;
END; $function$;

CREATE OR REPLACE FUNCTION get_current_sales_return(p_return_id bigint) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE result JSON;
BEGIN
    SELECT json_build_object(
        'sales_return_id', sr.sales_return_id,
        'Customer',        pa.party_name,
        'return_date',     sr.return_date,
        'total_amount',    sr.total_amount,
        'description',     sr.description,
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
    LEFT JOIN auth_user u ON u.id = sr.created_by
    WHERE sr.sales_return_id = p_return_id;
    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION get_current_purchase_return(p_return_id bigint) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE result JSON;
BEGIN
    SELECT json_build_object(
        'purchase_return_id', pr.purchase_return_id,
        'Vendor',             pa.party_name,
        'return_date',        pr.return_date,
        'total_amount',       pr.total_amount,
        'description',        pr.description,
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
    LEFT JOIN auth_user u ON u.id = pr.created_by
    WHERE pr.purchase_return_id = p_return_id;
    RETURN result;
END;
$$;
