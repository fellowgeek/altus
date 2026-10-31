<?php
require __DIR__ . '/bootstrap.php';

$users = new ohCRUD\Users();
$totp = OTPHP\TOTP::generate();
$insert = $pdo->prepare('INSERT INTO Users (ID, USERNAME, PASSWORD, STATUS, TOTP, TOTP_SECRET, PERMISSIONS) VALUES (?, ?, ?, 1, 1, ?, 2)');
foreach ([1, 2, 3] as $id) $insert->execute([$id, 'test' . $id,
    password_hash('correct-password' . __OHCRUD_SECRET__, PASSWORD_BCRYPT), $users->encryptText($totp->getSecret())]);

check($users->verify(1, $totp->now()) === false && empty($_SESSION['User']), 'OTP alone authenticated');
check($users->login('test1', 'wrong-password') === false, 'Wrong password accepted');
check($users->verify(1, $totp->now()) === false, 'Failed password created challenge');
check($users->login('test1', 'correct-password') !== false, 'Password login failed');
check(empty($_SESSION['User']), 'Password alone authenticated MFA account');
check($users->verify(2, $totp->now()) === false, 'Challenge used for a different account');
check($users->login('test1', 'correct-password') !== false, 'Second password login failed');
$users->setSession('totpChallenge', ['user_id' => 1, 'expires' => time() - 1, 'attempts' => 0]);
check($users->verify(1, $totp->now()) === false, 'Expired challenge accepted');
check($users->login('test1', 'correct-password') !== false, 'Fresh password login failed');
check($users->verify(1, $totp->now()) !== false && (int) $_SESSION['User']->ID === 1, 'Valid two-factor login failed');
$users->unsetSession('User');
check($users->verify(1, $totp->now()) === false, 'Completed challenge replayed');
check($users->login('test2', 'correct-password') !== false, 'Rate-limit fixture login failed');
for ($attempt = 0; $attempt < 5; $attempt++) check($users->verify(2, 'invalid') === false, 'Invalid OTP accepted');
check($users->verify(2, $totp->now()) === false, 'Challenge attempt limit bypassed');
check($users->login('test2', 'correct-password') !== false, 'Fresh login failed');
check($users->verify(2, $totp->now()) === false && $users->outputStatusCode === 429, 'New challenge bypassed account OTP limit');
$throttle = new ohCRUD\AuthThrottle();
check($throttle->allow('test', 'identity', 1), 'First throttle attempt denied');
check(!(new ohCRUD\AuthThrottle())->allow('test', 'identity', 1), 'New instance bypassed shared throttle');
echo "PASS: password binding, account binding, expiry, valid MFA, replay, challenge and shared attempt limits.\n";
