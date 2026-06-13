--
-- ============================================================
-- VIEW: generalledger
-- ============================================================
--

CREATE VIEW public.generalledger AS
 SELECT jl.line_id AS gl_entry_id,
    je.journal_id,
    je.entry_date,
    jl.account_id,
    jl.party_id,
    jl.debit,
    jl.credit,
    je.description
   FROM journallines jl
     JOIN journalentries je ON jl.journal_id = je.journal_id;;


ALTER VIEW public.generalledger OWNER TO postgres;
