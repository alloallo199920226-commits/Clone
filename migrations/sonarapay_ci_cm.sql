-- Preserve all historical orders while adding CI (except Wave) and Cameroon.
ALTER TABLE public.shineray_sonarapay_orders
  DROP CONSTRAINT IF EXISTS shineray_sonarapay_orders_operator_id_check,
  DROP CONSTRAINT IF EXISTS shineray_sonarapay_orders_payer_phone_check,
  ADD CONSTRAINT shineray_sonarapay_orders_operator_id_check CHECK (operator_id IN (
    'mtn_bj','moov_bj','celtiis_bj','orange_bf','moov_bf','telecel_bf',
    'tmoney_tg','moov_tg','orange_ci','mtn_ci','moov_ci','mtn_cm','orange_cm'
  )),
  ADD CONSTRAINT shineray_sonarapay_orders_payer_phone_check CHECK (
    (operator_id IN ('mtn_bj','moov_bj','celtiis_bj') AND payer_phone ~ '^\+22901[0-9]{8}$')
    OR (operator_id IN ('orange_bf','moov_bf','telecel_bf') AND payer_phone ~ '^\+226[0-9]{8}$')
    OR (operator_id IN ('tmoney_tg','moov_tg') AND payer_phone ~ '^\+228[0-9]{8}$')
    OR (operator_id IN ('orange_ci','mtn_ci','moov_ci') AND payer_phone ~ '^\+225[0-9]{10}$')
    OR (operator_id IN ('mtn_cm','orange_cm') AND payer_phone ~ '^\+237[0-9]{9}$')
  );
