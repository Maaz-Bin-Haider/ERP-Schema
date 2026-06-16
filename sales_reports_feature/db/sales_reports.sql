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
CREATE OR REPLACE VIEW public.vw_sold_serial_profit AS
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
FROM public.soldunits su
JOIN public.salesitems     si  ON si.sales_item_id   = su.sales_item_id
JOIN public.salesinvoices  s   ON s.sales_invoice_id = si.sales_invoice_id
JOIN public.items          it  ON it.item_id         = si.item_id
LEFT JOIN public.parties   cust ON cust.party_id     = s.customer_id
LEFT JOIN public.purchaseunits pu ON pu.unit_id      = su.unit_id
LEFT JOIN public.purchaseitems pi ON pi.purchase_item_id = pu.purchase_item_id
LEFT JOIN public.purchaseinvoices pv ON pv.purchase_invoice_id = pi.purchase_invoice_id
LEFT JOIN public.parties   vend ON vend.party_id     = pv.vendor_id
WHERE su.status = 'Sold';


-- ============================================================
-- 1. SALES SUMMARY
-- ============================================================
CREATE OR REPLACE FUNCTION public.sales_summary_json(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $function$
DECLARE
    v_rev numeric := 0; v_cost numeric := 0; v_profit numeric := 0;
    v_inv int := 0; v_units int := 0;
    v_ret_count int := 0; v_ret_value numeric := 0; v_ret_profit numeric := 0;
BEGIN
    SELECT COALESCE(SUM(revenue),0), COALESCE(SUM(cost),0), COALESCE(SUM(profit),0),
           COUNT(DISTINCT sales_invoice_id), COUNT(*)
    INTO v_rev, v_cost, v_profit, v_inv, v_units
    FROM public.vw_sold_serial_profit
    WHERE invoice_date BETWEEN p_from AND p_to;

    -- Returns activity in the period (by return_date), informational
    SELECT COUNT(DISTINCT sr.sales_return_id),
           COALESCE(SUM(sri.sold_price),0),
           COALESCE(SUM(sri.sold_price - sri.cost_price),0)
    INTO v_ret_count, v_ret_value, v_ret_profit
    FROM public.salesreturns sr
    JOIN public.salesreturnitems sri ON sri.sales_return_id = sr.sales_return_id
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
CREATE OR REPLACE FUNCTION public.product_profitability_json(p_from date, p_to date)
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
        FROM public.vw_sold_serial_profit
        WHERE invoice_date BETWEEN p_from AND p_to
        GROUP BY item_id, item_name, brand, category
    ) t;

    SELECT COALESCE(SUM(revenue),0), COALESCE(SUM(cost),0), COALESCE(SUM(profit),0), COUNT(*)
    INTO v_rev, v_cost, v_profit, v_units
    FROM public.vw_sold_serial_profit WHERE invoice_date BETWEEN p_from AND p_to;

    RETURN jsonb_build_object('from',p_from,'to',p_to,'rows',v_rows,
        'totals', jsonb_build_object('units',v_units,'revenue',ROUND(v_rev,2),
            'cost',ROUND(v_cost,2),'profit',ROUND(v_profit,2),
            'margin_pct', CASE WHEN v_rev>0 THEN ROUND(v_profit/v_rev*100,2) ELSE 0 END));
END;
$function$;


-- ============================================================
-- 3. CUSTOMER PROFITABILITY
-- ============================================================
CREATE OR REPLACE FUNCTION public.customer_profitability_json(p_from date, p_to date)
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
        FROM public.vw_sold_serial_profit
        WHERE invoice_date BETWEEN p_from AND p_to
        GROUP BY customer_id, customer_name
    ) t;

    SELECT COALESCE(SUM(revenue),0), COALESCE(SUM(cost),0), COALESCE(SUM(profit),0), COUNT(*)
    INTO v_rev, v_cost, v_profit, v_units
    FROM public.vw_sold_serial_profit WHERE invoice_date BETWEEN p_from AND p_to;

    RETURN jsonb_build_object('from',p_from,'to',p_to,'rows',v_rows,
        'totals', jsonb_build_object('units',v_units,'revenue',ROUND(v_rev,2),
            'cost',ROUND(v_cost,2),'profit',ROUND(v_profit,2),
            'margin_pct', CASE WHEN v_rev>0 THEN ROUND(v_profit/v_rev*100,2) ELSE 0 END));
END;
$function$;


-- ============================================================
-- 4. SALES BY PRODUCT  (volume + revenue, no cost)
-- ============================================================
CREATE OR REPLACE FUNCTION public.sales_by_product_json(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $function$
DECLARE v_rows jsonb; v_total numeric; v_units int;
BEGIN
    SELECT COALESCE(SUM(revenue),0), COUNT(*) INTO v_total, v_units
    FROM public.vw_sold_serial_profit WHERE invoice_date BETWEEN p_from AND p_to;

    SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'revenue')::numeric DESC), '[]'::jsonb)
    INTO v_rows FROM (
        SELECT jsonb_build_object(
            'item_name', item_name, 'brand', brand, 'category', category,
            'units', COUNT(*),
            'revenue', ROUND(SUM(revenue),2),
            'pct_of_total', CASE WHEN v_total>0 THEN ROUND(SUM(revenue)/v_total*100,2) ELSE 0 END
        ) AS r
        FROM public.vw_sold_serial_profit
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
CREATE OR REPLACE FUNCTION public.sales_by_customer_json(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $function$
DECLARE v_rows jsonb; v_total numeric; v_units int;
BEGIN
    SELECT COALESCE(SUM(revenue),0), COUNT(*) INTO v_total, v_units
    FROM public.vw_sold_serial_profit WHERE invoice_date BETWEEN p_from AND p_to;

    SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'revenue')::numeric DESC), '[]'::jsonb)
    INTO v_rows FROM (
        SELECT jsonb_build_object(
            'customer_name', customer_name,
            'invoices', COUNT(DISTINCT sales_invoice_id),
            'units', COUNT(*),
            'revenue', ROUND(SUM(revenue),2),
            'pct_of_total', CASE WHEN v_total>0 THEN ROUND(SUM(revenue)/v_total*100,2) ELSE 0 END
        ) AS r
        FROM public.vw_sold_serial_profit
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
CREATE OR REPLACE FUNCTION public.sale_wise_profit_json(p_from date, p_to date)
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
        FROM public.vw_sold_serial_profit
        WHERE invoice_date BETWEEN p_from AND p_to
    ) t;

    SELECT COALESCE(SUM(revenue),0), COALESCE(SUM(cost),0), COALESCE(SUM(profit),0), COUNT(*)
    INTO v_rev, v_cost, v_profit, v_units
    FROM public.vw_sold_serial_profit WHERE invoice_date BETWEEN p_from AND p_to;

    RETURN jsonb_build_object('from',p_from,'to',p_to,'rows',v_rows,
        'totals', jsonb_build_object('units',v_units,'revenue',ROUND(v_rev,2),
            'cost',ROUND(v_cost,2),'profit',ROUND(v_profit,2),
            'margin_pct', CASE WHEN v_rev>0 THEN ROUND(v_profit/v_rev*100,2) ELSE 0 END));
END;
$function$;


-- ============================================================
-- 7. SALES TREND  (time series; granularity day|week|month)
-- ============================================================
CREATE OR REPLACE FUNCTION public.sales_trend_json(p_from date, p_to date, p_granularity text DEFAULT 'day')
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
        FROM public.vw_sold_serial_profit
        WHERE invoice_date BETWEEN p_from AND p_to
        GROUP BY date_trunc(v_g, invoice_date)
    ) t;

    RETURN jsonb_build_object('from',p_from,'to',p_to,'granularity',v_g,'rows',v_rows);
END;
$function$;


-- ============================================================
-- 8. INVOICE REGISTER  (invoices issued in range)
-- ============================================================
CREATE OR REPLACE FUNCTION public.invoice_register_json(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $function$
DECLARE v_rows jsonb; v_total numeric; v_count int;
BEGIN
    SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'invoice_date') DESC, (r->>'sales_invoice_id')::bigint DESC), '[]'::jsonb)
    INTO v_rows FROM (
        SELECT jsonb_build_object(
            'sales_invoice_id', s.sales_invoice_id,
            'invoice_date', s.invoice_date,
            'customer_name', COALESCE(cust.party_name,'No customer'),
            'items', (SELECT COUNT(*) FROM public.salesitems si WHERE si.sales_invoice_id = s.sales_invoice_id),
            'units', (SELECT COALESCE(SUM(si.quantity),0) FROM public.salesitems si WHERE si.sales_invoice_id = s.sales_invoice_id),
            'total_amount', ROUND(s.total_amount,2)
        ) AS r
        FROM public.salesinvoices s
        LEFT JOIN public.parties cust ON cust.party_id = s.customer_id
        WHERE s.invoice_date BETWEEN p_from AND p_to
    ) t;

    SELECT COUNT(*), COALESCE(SUM(total_amount),0) INTO v_count, v_total
    FROM public.salesinvoices WHERE invoice_date BETWEEN p_from AND p_to;

    RETURN jsonb_build_object('from',p_from,'to',p_to,'rows',v_rows,
        'totals', jsonb_build_object('invoices',v_count,'total_amount',ROUND(v_total,2)));
END;
$function$;
