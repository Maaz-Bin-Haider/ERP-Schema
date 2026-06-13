--
-- ============================================================
-- FUNCTION: get_trial_balance_json()
-- ============================================================
--

CREATE FUNCTION public.get_trial_balance_json() RETURNS jsonb
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


ALTER FUNCTION public.get_trial_balance_json() OWNER TO postgres;
