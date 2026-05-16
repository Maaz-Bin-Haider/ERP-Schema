-- ============================================================
-- FILE: trg_soldunits_sync_stock_statement.sql
-- PURPOSE: Fix ghost serials (in_stock = FALSE with no soldunits
--          record) ONCE after each full statement on soldunits
--          completes — not per row, so helper functions and
--          journal rebuilds inside update_sale_invoice() finish
--          first before any cleanup runs.
-- ============================================================


-- ── 1. TRIGGER FUNCTION (statement-level) ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_soldunits_fix_ghost_stock()
RETURNS TRIGGER
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

COMMENT ON FUNCTION public.trg_fn_soldunits_fix_ghost_stock() IS
'Statement-level trigger function. Runs once after each INSERT,
UPDATE, or DELETE statement on soldunits finishes completely.
Restores in_stock = TRUE for any serial that no longer has a
soldunits or purchasereturnitems record to justify being out of stock.';


-- ── 2. TRIGGER DEFINITION (FOR EACH STATEMENT) ──────────────────────────────

DROP TRIGGER IF EXISTS trg_soldunits_fix_ghost_stock ON public.soldunits;

CREATE TRIGGER trg_soldunits_fix_ghost_stock
AFTER INSERT OR UPDATE OR DELETE
ON public.soldunits
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_fn_soldunits_fix_ghost_stock();

COMMENT ON TRIGGER trg_soldunits_fix_ghost_stock ON public.soldunits IS
'Fires once after each full INSERT/UPDATE/DELETE statement on soldunits.
Cleans up any ghost serials left with in_stock = FALSE and no matching
soldunits or purchasereturnitems record.';


-- ── 3. ONE-TIME CLEANUP (fix existing ghosts right now) ──────────────────────

DO $$
DECLARE
    v_fixed INT;
BEGIN
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

    GET DIAGNOSTICS v_fixed = ROW_COUNT;
    RAISE NOTICE 'One-time cleanup: % ghost serial(s) restored to in_stock = TRUE.', v_fixed;
END;
$$;


-- ── 4. VERIFICATION ──────────────────────────────────────────────────────────
-- All three counts must be 0.

SELECT 'Stranded false flag (ghost serials)'         AS check_name, COUNT(*) AS count
FROM purchaseunits pu
WHERE pu.in_stock = FALSE
  AND NOT EXISTS (SELECT 1 FROM soldunits su
                  WHERE su.unit_id = pu.unit_id AND su.status IN ('Sold','Returned'))
  AND NOT EXISTS (SELECT 1 FROM purchasereturnitems pri
                  WHERE pri.serial_number = pu.serial_number)

UNION ALL

SELECT 'Orphaned sold flag (in_stock=TRUE but Sold)', COUNT(*)
FROM purchaseunits pu
WHERE pu.in_stock = TRUE
  AND EXISTS (SELECT 1 FROM soldunits su
              WHERE su.unit_id = pu.unit_id AND su.status = 'Sold')

UNION ALL

SELECT 'Orphaned return flag (in_stock=TRUE but purchase-returned)', COUNT(*)
FROM purchaseunits pu
WHERE pu.in_stock = TRUE
  AND EXISTS (SELECT 1 FROM purchasereturnitems pri
              WHERE pri.serial_number = pu.serial_number);