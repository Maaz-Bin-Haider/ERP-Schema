--
-- ============================================================
-- FUNCTION: get_party_balance_by_name(p_name text)
-- ============================================================
-- Returns the current net balance for a party looked up by name
-- (case-insensitive).
--
-- Balance sign convention (mirrors vw_trial_balance / party_totals):
--   positive  → party owes us      (Receivable / Debit balance)
--   negative  → we owe the party   (Payable    / Credit balance)
--
-- Returns JSON:
--   { "found": true,  "party_name": "...", "balance": 12345.67, "party_type": "Customer" }
--   { "found": false, "party_name": "..." }
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_party_balance_by_name(p_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_build_object(
        'found',      TRUE,
        'party_name', p.party_name,
        'party_type', p.party_type,
        'balance',    COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)
    )
    INTO v_result
    FROM parties p
    LEFT JOIN journallines jl ON jl.party_id = p.party_id
    WHERE p.party_name ILIKE p_name
    GROUP BY p.party_name, p.party_type
    LIMIT 1;

    -- Party not found
    IF v_result IS NULL THEN
        RETURN json_build_object(
            'found',      FALSE,
            'party_name', p_name
        );
    END IF;

    RETURN v_result;
END;
$$;

ALTER FUNCTION public.get_party_balance_by_name(text) OWNER TO postgres;