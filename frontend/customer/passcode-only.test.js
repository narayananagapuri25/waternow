const assert=require('node:assert/strict');
const fs=require('node:fs');

const authUi=fs.readFileSync('notifications.js','utf8');
const page=fs.readFileSync('index.html','utf8');
const worker=fs.readFileSync('sw.js','utf8');

assert.ok(authUi.includes('WATERNOW ACCOUNT'),'customer sign-in must use WaterNow account branding');
assert.ok(authUi.includes("'/api/auth/register'"),'customer account creation must use the passcode registration endpoint');
assert.ok(authUi.includes("'/api/auth/login'"),'customer sign-in must use the passcode login endpoint');
assert.match(authUi,/Passcode must be exactly 6 digits/,'login and registration must validate a six-digit passcode');
assert.match(authUi,/Passcodes do not match/,'new accounts must confirm the chosen passcode');
assert.match(authUi,/Create your WaterNow account with your mobile number and a personal 6-digit passcode/);
assert.match(authUi,/Use your registered mobile number and 6-digit passcode to log in/);
assert.match(authUi,/contact WaterNow from Profile → Contact Us/i,'passcode assistance must point customers to Contact Us');
assert.doesNotMatch(authUi,/passcodeForgot|Forgot passcode\?/,'no broken SMS recovery action should appear in the customer account modal');
assert.doesNotMatch(authUi,/passcode-reset|passcodeResetCode|SMS verification code|autocomplete="one-time-code"/,
  'customer account auth must not depend on SMS/OTP while a network provider is not configured');
assert.ok(!authUi.includes('/api/auth/passcode-reset/start'));
assert.ok(!authUi.includes('/api/auth/passcode-reset/complete'));

assert.ok(page.includes('notifications.js?v=20261110-passcode-only-v1'),'customer HTML must load the immutable passcode-only auth asset');
assert.ok(worker.includes('/notifications.js?v=20261110-passcode-only-v1'),'customer service worker must precache the exact passcode-only auth asset');
assert.doesNotMatch(page, /id="otpModal"|id="otpCode"|id="otpVerify"|id="otpResend"/, 'the customer shell must not include an unused SMS/OTP form');
assert.match(worker,/const CACHE = 'waternow-customer-v13'/,'customer cache must refresh when account UI or notification assets change');
console.log('WaterNow customer passcode-only account UI contract OK');
