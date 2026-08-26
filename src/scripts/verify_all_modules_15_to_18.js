const { execSync } = require('child_process');
const path = require('path');

console.log('================================================================');
console.log('      MASTER VERIFICATION SUITE: MODULES 15, 16, 17 & 18        ');
console.log('================================================================\n');

const scripts = [
  { name: 'MODULE 15: Database Schema & Location Indexes', file: 'verify_module15.js' },
  { name: 'MODULE 16: Location Signup API & Form Persistence', file: 'verify_module16.js' },
  { name: 'MODULE 17: Post Event Form Location Fields & Validation', file: 'verify_module17.js' },
  { name: 'MODULE 18: Hierarchical Event Feed API (City/State/Country)', file: 'verify_module18.js' },
  { name: 'BASE SUITE: All 12 Automated Backend Regression Tests', file: '../tests/run_all_tests.js' },
];

let allPassed = true;

for (const script of scripts) {
  console.log(`\n▶ RUNNING: ${script.name}...`);
  try {
    const fullPath = path.join(__dirname, script.file);
    const output = execSync(`node "${fullPath}"`, {
      cwd: path.join(__dirname, '..', '..'),
      encoding: 'utf8',
    });
    console.log(output);
    console.log(`✅ ${script.name} PASSED SUCCESSFULLY!\n`);
  } catch (error) {
    allPassed = false;
    console.error(`❌ ${script.name} FAILED:`);
    console.error(error.stdout || error.message);
  }
}

console.log('================================================================');
if (allPassed) {
  console.log('🎉 ALL MODULES (15, 16, 17, 18) AND BASE TESTS ARE 100% WORKING!');
} else {
  console.log('⚠️ SOME VERIFICATION MODULES FAILED. SEE DETAILS ABOVE.');
}
console.log('================================================================\n');
