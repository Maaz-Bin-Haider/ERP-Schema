-- Diagnostic health check

SELECT 
    pu.serial_number,
    i.item_name,
    pu.in_stock AS current_flag,
    CASE
        WHEN EXISTS (SELECT 1 FROM soldunits su WHERE su.unit_id = pu.unit_id AND su.status = 'Sold')
            THEN 'should be FALSE (sold)'
        WHEN EXISTS (SELECT 1 FROM purchasereturnitems pri WHERE pri.serial_number = pu.serial_number)
            THEN 'should be FALSE (returned to vendor)'
        WHEN pu.in_stock = FALSE
            THEN 'should be TRUE (stranded)'
        ELSE 'OK'
    END AS diagnosis
FROM purchaseunits pu
JOIN purchaseitems pit ON pu.purchase_item_id = pit.purchase_item_id
JOIN items i ON pit.item_id = i.item_id
WHERE (
    -- in_stock=TRUE but evidence says it should be FALSE
    (pu.in_stock = TRUE AND (
        EXISTS (SELECT 1 FROM soldunits su WHERE su.unit_id = pu.unit_id AND su.status = 'Sold')
        OR EXISTS (SELECT 1 FROM purchasereturnitems pri WHERE pri.serial_number = pu.serial_number)
    ))
    OR
    -- in_stock=FALSE but no evidence to justify it
    (pu.in_stock = FALSE AND NOT EXISTS (
        SELECT 1 FROM soldunits su WHERE su.unit_id = pu.unit_id AND su.status IN ('Sold','Returned')
    ) AND NOT EXISTS (
        SELECT 1 FROM purchasereturnitems pri WHERE pri.serial_number = pu.serial_number
    ))
)
ORDER BY i.item_name;


--- check for in stock but not showing in reports query

SELECT 
    pu.serial_number,
    pu.unit_id,
    i.item_name,
    pu.in_stock,
    EXISTS (
        SELECT 1 FROM soldunits su 
        WHERE su.unit_id = pu.unit_id 
          AND su.status IN ('Sold', 'Returned')
    ) AS has_any_soldunits_record,
    EXISTS (
        SELECT 1 FROM purchasereturnitems pri 
        WHERE pri.serial_number = pu.serial_number
    ) AS has_purchase_return
FROM purchaseunits pu
JOIN purchaseitems pit ON pu.purchase_item_id = pit.purchase_item_id
JOIN items i ON pit.item_id = i.item_id
WHERE pu.in_stock = FALSE
  AND NOT EXISTS (
      SELECT 1 FROM soldunits su 
      WHERE su.unit_id = pu.unit_id 
        AND su.status IN ('Sold', 'Returned')
  )
  AND NOT EXISTS (
      SELECT 1 FROM purchasereturnitems pri 
      WHERE pri.serial_number = pu.serial_number
  );



-- FIX
BEGIN;

-- Fix: restore  genuinely in-stock serials that are not showing in reports
UPDATE purchaseunits
SET in_stock = TRUE
WHERE unit_id IN (9401,9402,9403);

-- Verification — all 3 must be 0 before committing
SELECT 'Orphaned sold flag' AS check_name, COUNT(*) AS count
FROM purchaseunits pu
WHERE pu.in_stock = TRUE
  AND EXISTS (SELECT 1 FROM soldunits su WHERE su.unit_id = pu.unit_id AND su.status = 'Sold')

UNION ALL

SELECT 'Orphaned return flag', COUNT(*)
FROM purchaseunits pu
WHERE pu.in_stock = TRUE
  AND EXISTS (SELECT 1 FROM purchasereturnitems pri WHERE pri.serial_number = pu.serial_number)

UNION ALL

SELECT 'Stranded false flag', COUNT(*)
FROM purchaseunits pu
WHERE pu.in_stock = FALSE
  AND NOT EXISTS (SELECT 1 FROM soldunits su WHERE su.unit_id = pu.unit_id AND su.status IN ('Sold','Returned'))
  AND NOT EXISTS (SELECT 1 FROM purchasereturnitems pri WHERE pri.serial_number = pu.serial_number);