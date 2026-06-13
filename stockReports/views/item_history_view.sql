--
-- ============================================================
-- VIEW: item_history_view
-- ============================================================
--

CREATE VIEW public.item_history_view AS
 WITH purchase_history AS (
         SELECT i.item_id,
            i.item_name,
            pu.serial_number,
            p.invoice_date AS transaction_date,
            'PURCHASE'::text AS transaction_type,
            v.party_name AS counterparty,
            pi.unit_price AS price
           FROM purchaseunits pu
             JOIN purchaseitems pi ON pu.purchase_item_id = pi.purchase_item_id
             JOIN purchaseinvoices p ON pi.purchase_invoice_id = p.purchase_invoice_id
             JOIN items i ON pi.item_id = i.item_id
             JOIN parties v ON p.vendor_id = v.party_id
          WHERE i.item_name::text ~~* '%iPhone 15 Pro%'::text
        ), sale_history AS (
         SELECT i.item_id,
            i.item_name,
            pu.serial_number,
            s.invoice_date AS transaction_date,
            'SALE'::text AS transaction_type,
            c.party_name AS counterparty,
            su.sold_price AS price
           FROM soldunits su
             JOIN purchaseunits pu ON su.unit_id = pu.unit_id
             JOIN salesitems si ON su.sales_item_id = si.sales_item_id
             JOIN salesinvoices s ON si.sales_invoice_id = s.sales_invoice_id
             JOIN items i ON si.item_id = i.item_id
             JOIN parties c ON s.customer_id = c.party_id
          WHERE i.item_name::text ~~* '%iPhone 15 Pro%'::text
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
  ORDER BY transaction_date, transaction_type DESC, serial_number;;


ALTER VIEW public.item_history_view OWNER TO postgres;
