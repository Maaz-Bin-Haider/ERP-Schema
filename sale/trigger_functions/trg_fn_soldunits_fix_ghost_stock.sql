--
-- ============================================================
-- TRIGGER FUNCTION: trg_fn_soldunits_fix_ghost_stock()
-- ============================================================
--

CREATE FUNCTION public.trg_fn_soldunits_fix_ghost_stock() RETURNS trigger
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


ALTER FUNCTION public.trg_fn_soldunits_fix_ghost_stock() OWNER TO postgres;


COMMENT ON FUNCTION public.trg_fn_soldunits_fix_ghost_stock() IS
'Statement-level trigger function. Runs once after each INSERT,
UPDATE, or DELETE statement on soldunits finishes completely.
Restores in_stock = TRUE for any serial that no longer has a
soldunits or purchasereturnitems record to justify being out of stock.';
