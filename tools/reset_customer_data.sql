-- MANUAL OPERATION ONLY. Never run from app startup or from a publish hook.
-- Pause the production app and payment/income processing FIRST.
-- Back up the production database and resolve pending payouts BEFORE proceeding.
-- Preserves admin identities, independent console access, products and settings.
-- Deletes ALL customer financial activity, including pending payment orders.
-- DRY RUN by default: ROLLBACK below must be changed to COMMIT to apply.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
LOCK TABLE shineray_users, shineray_sessions, shineray_admin_sessions,
    shineray_admin_login_attempts, shineray_demo_activity, shineray_wallets,
    shineray_transactions, shineray_deposit_approvals, shineray_first_deposits,
    shineray_manual_deposits, shineray_admin_operations, shineray_admin_audit,
    shineray_admin_vip_grants, shineray_sonarapay_orders,
    shineray_product_income, shineray_gift_redemptions,
    shineray_withdrawal_requests
    IN SHARE ROW EXCLUSIVE MODE;

SELECT 'before' AS stage,
    (SELECT count(*) FROM shineray_users WHERE NOT is_admin) AS customers,
    (SELECT count(*) FROM shineray_users WHERE is_admin) AS admins,
    (SELECT count(*) FROM shineray_admin_resources WHERE kind='product') AS products,
    (SELECT count(*) FROM shineray_withdrawal_requests WHERE status='pending') AS pending_withdrawals;

DELETE FROM shineray_admin_sessions;
DELETE FROM shineray_sessions;
DELETE FROM shineray_admin_login_attempts;
DELETE FROM shineray_demo_activity;
DELETE FROM shineray_gift_redemptions;
DELETE FROM shineray_product_income;
DELETE FROM shineray_withdrawal_requests;
DELETE FROM shineray_sonarapay_orders;
DELETE FROM shineray_first_deposits;
DELETE FROM shineray_deposit_approvals;
DELETE FROM shineray_manual_deposits;
DELETE FROM shineray_admin_operations;
DELETE FROM shineray_admin_audit;
DELETE FROM shineray_admin_vip_grants;
DELETE FROM shineray_transactions;
DELETE FROM shineray_wallets;
UPDATE shineray_users SET referred_by=NULL WHERE referred_by IS NOT NULL;
DELETE FROM shineray_users WHERE NOT is_admin;

SELECT 'after' AS stage,
    (SELECT count(*) FROM shineray_users WHERE NOT is_admin) AS customers,
    (SELECT count(*) FROM shineray_users WHERE is_admin) AS admins,
    (SELECT count(*) FROM shineray_admin_resources WHERE kind='product') AS products,
    (SELECT count(*) FROM shineray_transactions) AS activities,
    (SELECT count(*) FROM shineray_withdrawal_requests) AS withdrawals;
-- Keep ROLLBACK for rehearsal. Only use COMMIT after reviewing the result.
ROLLBACK;
