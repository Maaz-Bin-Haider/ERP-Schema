--
-- ============================================================
-- TRIGGER: soldunits trg_soldunits_fix_ghost_stock
-- ============================================================
--

CREATE TRIGGER trg_soldunits_fix_ghost_stock AFTER INSERT OR DELETE OR UPDATE ON public.soldunits FOR EACH STATEMENT EXECUTE FUNCTION public.trg_fn_soldunits_fix_ghost_stock();


COMMENT ON TRIGGER trg_soldunits_fix_ghost_stock ON public.soldunits IS
'Fires once after each full INSERT/UPDATE/DELETE statement on soldunits.
Cleans up any ghost serials left with in_stock = FALSE and no matching
soldunits or purchasereturnitems record.';
