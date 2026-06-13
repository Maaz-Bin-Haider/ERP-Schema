--
-- ============================================================
-- VIEW: sale_wise_profit_view
-- ============================================================
--

CREATE VIEW public.sale_wise_profit_view AS
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
           FROM soldunits su
             JOIN purchaseunits pu ON su.unit_id = pu.unit_id
             JOIN salesitems si ON su.sales_item_id = si.sales_item_id
             JOIN salesinvoices s ON si.sales_invoice_id = s.sales_invoice_id
             JOIN items i ON si.item_id = i.item_id
          WHERE s.invoice_date >= '2025-10-17'::date AND s.invoice_date <= '2025-10-31'::date
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
           FROM purchaseunits pu
             JOIN purchaseitems pi ON pu.purchase_item_id = pi.purchase_item_id
             JOIN purchaseinvoices p ON pi.purchase_invoice_id = p.purchase_invoice_id
             JOIN items i ON pi.item_id = i.item_id
        )
 SELECT ss.sale_date,
    ss.serial_number,
    ss.item_name,
    ss.sold_price AS sale_price,
    ps.purchase_price,
    round(ss.sold_price - ps.purchase_price, 2) AS profit_loss,
        CASE
            WHEN ps.purchase_price > 0::numeric THEN round((ss.sold_price - ps.purchase_price) / ps.purchase_price * 100::numeric, 2)
            ELSE NULL::numeric
        END AS profit_loss_percent,
    v.party_name AS vendor_name,
    ps.purchase_date
   FROM sold_serials ss
     LEFT JOIN purchased_serials ps ON ss.serial_number::text = ps.serial_number::text
     LEFT JOIN parties v ON ps.vendor_id = v.party_id
  ORDER BY ss.sale_date, ss.item_name, ss.serial_number;;


ALTER VIEW public.sale_wise_profit_view OWNER TO postgres;
