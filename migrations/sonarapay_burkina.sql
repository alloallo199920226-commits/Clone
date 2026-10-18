-- Run once on an existing database, without deleting any orders or balances.
BEGIN;
ALTER TABLE public.shineray_sonarapay_orders
  DROP CONSTRAINT IF EXISTS shineray_sonarapay_orders_operator_id_check,
  DROP CONSTRAINT IF EXISTS shineray_sonarapay_orders_payer_phone_check;
ALTER TABLE public.shineray_sonarapay_orders
  ADD CONSTRAINT shineray_sonarapay_orders_operator_id_check
    CHECK (operator_id IN ('mtn_bj','moov_bj','celtiis_bj','orange_bf','moov_bf','telecel_bf')),
  ADD CONSTRAINT shineray_sonarapay_orders_payer_phone_check CHECK (
    (operator_id IN ('mtn_bj','moov_bj','celtiis_bj') AND payer_phone ~ '^\+22901[0-9]{8}$')
    OR (operator_id IN ('orange_bf','moov_bf','telecel_bf') AND payer_phone ~ '^\+226[0-9]{8}$')
  );
COMMIT;
