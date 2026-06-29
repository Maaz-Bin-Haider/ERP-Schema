-- add_cash_transactions.sql
-- ============================================================================
-- Cash Sale / Cash Purchase (and their returns) WITHOUT creating a credit party
-- balance. Reuses the existing Cash account and the existing journal/serial
-- posting; the ONLY change is the counterparty line of each journal:
--
--   * Credit Sale  (unchanged): Debit  Accounts Receivable (party)
--   * Cash   Sale  (new):       Debit  Cash               (no party)
--   * Credit Purch (unchanged): Credit Accounts Payable    (party)
--   * Cash   Purch (new):       Credit Cash               (no party)
--   * returns mirror the above for cash counterparties.
--
-- The signal is the counterparty itself: two sentinel parties ("Cash Sale",
-- "Cash Purchase") carry a new Parties.is_cash flag. When a journal's
-- counterparty is_cash, the builder posts to the existing Cash account with NO
-- party_id, so the cash party never accrues a receivable/payable and no
-- "receive payment" / "pay supplier" step is needed.
--
-- Existing parties default is_cash=false => credit flow is byte-for-byte
-- unchanged. Idempotent. Apply with:
--   python manage.py apply_sql_all_tenants tenancy/sql/add_cash_transactions.sql
-- ============================================================================

-- 1) Flag on Parties ---------------------------------------------------------
ALTER TABLE Parties ADD COLUMN IF NOT EXISTS is_cash boolean DEFAULT false;

-- 2) Sentinel cash parties: get-or-create, return id -------------------------
CREATE OR REPLACE FUNCTION get_cash_party_id(p_kind text) RETURNS bigint
    LANGUAGE plpgsql AS $$
DECLARE
    v_id   bigint;
    v_name text;
    v_type text;
BEGIN
    IF p_kind = 'sale' THEN
        v_name := 'Cash Sale';     v_type := 'Customer';
    ELSIF p_kind = 'purchase' THEN
        v_name := 'Cash Purchase'; v_type := 'Vendor';
    ELSE
        RAISE EXCEPTION 'get_cash_party_id: kind must be sale|purchase, got %', p_kind;
    END IF;

    SELECT party_id INTO v_id FROM Parties WHERE party_name = v_name LIMIT 1;
    IF v_id IS NULL THEN
        PERFORM add_party_from_json(jsonb_build_object(
            'party_name', v_name, 'party_type', v_type,
            'opening_balance', 0, 'balance_type', 'Debit'));
        SELECT party_id INTO v_id FROM Parties WHERE party_name = v_name LIMIT 1;
    END IF;
    UPDATE Parties SET is_cash = true WHERE party_id = v_id AND COALESCE(is_cash,false) = false;
    RETURN v_id;
END; $$;

-- ============================================================================
-- 3) Journal builders — add the cash branch (everything else unchanged)
-- ============================================================================

-- 3a) SALES ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rebuild_sales_journal(p_invoice_id bigint) RETURNS void
    LANGUAGE plpgsql AS $$
DECLARE
    j_id BIGINT;
    rev_acc BIGINT;
    party_acc BIGINT;
    cogs_acc BIGINT;
    inv_acc BIGINT;
    cash_acc BIGINT;
    v_is_cash BOOLEAN := false;
    total_cost NUMERIC(14,2);
    total_revenue NUMERIC(14,2);
    v_customer_id BIGINT;
    v_invoice_date DATE;
BEGIN
    SELECT journal_id INTO j_id FROM SalesInvoices WHERE sales_invoice_id = p_invoice_id;
    IF j_id IS NOT NULL THEN
        DELETE FROM JournalLines WHERE journal_id = j_id;
        DELETE FROM JournalEntries WHERE journal_id = j_id;
    END IF;

    SELECT s.customer_id, s.total_amount, s.invoice_date
    INTO v_customer_id, total_revenue, v_invoice_date
    FROM SalesInvoices s WHERE s.sales_invoice_id = p_invoice_id;

    SELECT account_id INTO rev_acc  FROM ChartOfAccounts WHERE account_name='Sales Revenue';
    SELECT account_id INTO cogs_acc FROM ChartOfAccounts WHERE account_name='Cost of Goods Sold';
    SELECT account_id INTO inv_acc  FROM ChartOfAccounts WHERE account_name='Inventory';
    SELECT account_id INTO cash_acc FROM ChartOfAccounts WHERE account_name='Cash';
    SELECT ar_account_id INTO party_acc FROM Parties WHERE party_id = v_customer_id;
    SELECT COALESCE(is_cash,false) INTO v_is_cash FROM Parties WHERE party_id = v_customer_id;

    INSERT INTO JournalEntries(entry_date, description)
    VALUES (v_invoice_date, 'Sale Invoice ' || p_invoice_id)
    RETURNING journal_id INTO j_id;

    UPDATE SalesInvoices SET journal_id = j_id WHERE sales_invoice_id = p_invoice_id;

    -- (1) Debit Customer AR  OR  Cash (cash sale -> no party, cash increases now)
    IF v_is_cash THEN
        INSERT INTO JournalLines(journal_id, account_id, debit)
        VALUES (j_id, cash_acc, total_revenue);
    ELSE
        INSERT INTO JournalLines(journal_id, account_id, party_id, debit)
        VALUES (j_id, party_acc, v_customer_id, total_revenue);
    END IF;

    -- (2) Credit Revenue
    INSERT INTO JournalLines(journal_id, account_id, credit)
    VALUES (j_id, rev_acc, total_revenue);

    -- (3) Debit COGS / Credit Inventory
    SELECT COALESCE(SUM(pi.unit_price),0) INTO total_cost
    FROM SoldUnits su
    JOIN PurchaseUnits pu ON su.unit_id = pu.unit_id
    JOIN PurchaseItems pi ON pu.purchase_item_id = pi.purchase_item_id
    JOIN SalesItems si ON su.sales_item_id = si.sales_item_id
    WHERE si.sales_invoice_id = p_invoice_id;

    IF total_cost > 0 THEN
        INSERT INTO JournalLines(journal_id, account_id, debit)  VALUES (j_id, cogs_acc, total_cost);
        INSERT INTO JournalLines(journal_id, account_id, credit) VALUES (j_id, inv_acc, total_cost);
    END IF;
END; $$;

-- 3b) PURCHASES --------------------------------------------------------------
CREATE OR REPLACE FUNCTION rebuild_purchase_journal(p_invoice_id bigint) RETURNS void
    LANGUAGE plpgsql AS $$
DECLARE
    j_id BIGINT;
    inv_acc BIGINT;
    party_acc BIGINT;
    cash_acc BIGINT;
    v_is_cash BOOLEAN := false;
    v_total NUMERIC(14,2);
    v_vendor_id BIGINT;
BEGIN
    SELECT journal_id INTO j_id FROM PurchaseInvoices WHERE purchase_invoice_id = p_invoice_id;
    IF j_id IS NOT NULL THEN
        DELETE FROM JournalEntries WHERE journal_id = j_id;
    END IF;

    SELECT vendor_id, total_amount INTO v_vendor_id, v_total
    FROM PurchaseInvoices WHERE purchase_invoice_id = p_invoice_id;

    SELECT account_id INTO inv_acc  FROM ChartOfAccounts WHERE account_name='Inventory';
    SELECT account_id INTO cash_acc FROM ChartOfAccounts WHERE account_name='Cash';
    SELECT ap_account_id INTO party_acc FROM Parties WHERE party_id = v_vendor_id;
    SELECT COALESCE(is_cash,false) INTO v_is_cash FROM Parties WHERE party_id = v_vendor_id;

    INSERT INTO JournalEntries(entry_date, description)
    SELECT invoice_date, 'Purchase Invoice ' || purchase_invoice_id
    FROM PurchaseInvoices WHERE purchase_invoice_id = p_invoice_id
    RETURNING journal_id INTO j_id;

    UPDATE PurchaseInvoices SET journal_id = j_id WHERE purchase_invoice_id = p_invoice_id;

    -- (6) Debit Inventory
    INSERT INTO JournalLines(journal_id, account_id, debit)
    VALUES (j_id, inv_acc, v_total);

    -- (7) Credit Vendor AP  OR  Cash (cash purchase -> no party, cash decreases now)
    IF v_is_cash THEN
        INSERT INTO JournalLines(journal_id, account_id, credit)
        VALUES (j_id, cash_acc, v_total);
    ELSE
        INSERT INTO JournalLines(journal_id, account_id, party_id, credit)
        VALUES (j_id, party_acc, v_vendor_id, v_total);
    END IF;
END; $$;

-- 3c) SALES RETURN -----------------------------------------------------------
CREATE OR REPLACE FUNCTION rebuild_sales_return_journal(p_return_id bigint) RETURNS void
    LANGUAGE plpgsql AS $$
DECLARE
    j_id BIGINT;
    rev_acc BIGINT;
    cogs_acc BIGINT;
    inv_acc BIGINT;
    party_acc BIGINT;
    cash_acc BIGINT;
    v_is_cash BOOLEAN := false;
    v_total NUMERIC(14,2);
    v_cost NUMERIC(14,2);
    v_customer_id BIGINT;
    v_date DATE;
BEGIN
    SELECT journal_id INTO j_id FROM SalesReturns WHERE sales_return_id = p_return_id;
    IF j_id IS NOT NULL THEN
        DELETE FROM JournalEntries WHERE journal_id = j_id;
    END IF;

    SELECT customer_id, total_amount, return_date
    INTO v_customer_id, v_total, v_date
    FROM SalesReturns WHERE sales_return_id = p_return_id;

    SELECT COALESCE(SUM(cost_price),0) INTO v_cost
    FROM SalesReturnItems WHERE sales_return_id = p_return_id;

    SELECT account_id INTO rev_acc  FROM ChartOfAccounts WHERE account_name='Sales Revenue';
    SELECT account_id INTO cogs_acc FROM ChartOfAccounts WHERE account_name='Cost of Goods Sold';
    SELECT account_id INTO inv_acc  FROM ChartOfAccounts WHERE account_name='Inventory';
    SELECT account_id INTO cash_acc FROM ChartOfAccounts WHERE account_name='Cash';
    SELECT ar_account_id INTO party_acc FROM Parties WHERE party_id = v_customer_id;
    SELECT COALESCE(is_cash,false) INTO v_is_cash FROM Parties WHERE party_id = v_customer_id;

    INSERT INTO JournalEntries(entry_date, description)
    VALUES (v_date, 'Sales Return ' || p_return_id)
    RETURNING journal_id INTO j_id;

    UPDATE SalesReturns SET journal_id = j_id WHERE sales_return_id = p_return_id;

    -- (1) Debit Sales Revenue
    IF v_total > 0 THEN
        INSERT INTO JournalLines(journal_id, account_id, debit)
        VALUES (j_id, rev_acc, v_total);
    END IF;

    -- (2) Credit Customer AR  OR  Cash (cash sale return -> refund cash, no party)
    IF v_total > 0 THEN
        IF v_is_cash THEN
            INSERT INTO JournalLines(journal_id, account_id, credit)
            VALUES (j_id, cash_acc, v_total);
        ELSE
            INSERT INTO JournalLines(journal_id, account_id, party_id, credit)
            VALUES (j_id, party_acc, v_customer_id, v_total);
        END IF;
    END IF;

    -- (3) Debit Inventory / (4) Credit COGS
    IF v_cost > 0 THEN
        INSERT INTO JournalLines(journal_id, account_id, debit)  VALUES (j_id, inv_acc, v_cost);
        INSERT INTO JournalLines(journal_id, account_id, credit) VALUES (j_id, cogs_acc, v_cost);
    END IF;
END; $$;

-- 3d) PURCHASE RETURN --------------------------------------------------------
CREATE OR REPLACE FUNCTION rebuild_purchase_return_journal(p_return_id bigint) RETURNS void
    LANGUAGE plpgsql AS $$
DECLARE
    j_id BIGINT;
    inv_acc BIGINT;
    party_acc BIGINT;
    cash_acc BIGINT;
    v_is_cash BOOLEAN := false;
    v_total NUMERIC(14,2);
    v_vendor_id BIGINT;
    v_date DATE;
BEGIN
    SELECT journal_id INTO j_id FROM PurchaseReturns WHERE purchase_return_id = p_return_id;
    IF j_id IS NOT NULL THEN
        DELETE FROM JournalEntries WHERE journal_id = j_id;
    END IF;

    SELECT vendor_id, total_amount, return_date
    INTO v_vendor_id, v_total, v_date
    FROM PurchaseReturns WHERE purchase_return_id = p_return_id;

    SELECT account_id INTO inv_acc  FROM ChartOfAccounts WHERE account_name='Inventory';
    SELECT account_id INTO cash_acc FROM ChartOfAccounts WHERE account_name='Cash';
    SELECT ap_account_id INTO party_acc FROM Parties WHERE party_id = v_vendor_id;
    SELECT COALESCE(is_cash,false) INTO v_is_cash FROM Parties WHERE party_id = v_vendor_id;

    INSERT INTO JournalEntries(entry_date, description)
    VALUES (v_date, 'Purchase Return ' || p_return_id)
    RETURNING journal_id INTO j_id;

    UPDATE PurchaseReturns SET journal_id = j_id WHERE purchase_return_id = p_return_id;

    -- (1) Debit Vendor AP  OR  Cash (cash purchase return -> cash refunded in, no party)
    IF v_total > 0 THEN
        IF v_is_cash THEN
            INSERT INTO JournalLines(journal_id, account_id, debit)
            VALUES (j_id, cash_acc, v_total);
        ELSE
            INSERT INTO JournalLines(journal_id, account_id, party_id, debit)
            VALUES (j_id, party_acc, v_vendor_id, v_total);
        END IF;
    END IF;

    -- (2) Credit Inventory
    IF v_total > 0 THEN
        INSERT INTO JournalLines(journal_id, account_id, credit)
        VALUES (j_id, inv_acc, v_total);
    END IF;
END; $$;
