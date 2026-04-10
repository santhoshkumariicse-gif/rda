const { register } = require('./src/controllers/authController');

const req = {
  body: {
    name: 'Jane Doe',
    email: 'jane.driver@example.com',
    password: 'securepassword123',
    phone: '+919988776655',
    role: 'driver',
    profileData: {
      licenseNumber: 'DL-999-1234',
      licenseType: 'HGMV',
      licenseExpiry: '2030-12-31',
      yearsExperience: 5,
      baseLocation: { city: 'Chennai', state: 'Tamil Nadu' }
    },
    termsVersion: '1.0',
    privacyVersion: '1.0'
  }
};

const res = {
  status: function(code) {
    this.statusCode = code;
    return this;
  },
  json: function(data) {
    console.log(`STATUS: ${this.statusCode}`);
    console.log(`RESPONSE: ${JSON.stringify(data, null, 2)}`);
  }
};

// Mock express-validator to return no errors
require('express-validator').validationResult = () => ({
  isEmpty: () => true,
  array: () => []
});

console.log('Testing driver registration...');
register(req, res).then(() => {
  console.log('Done.');
  process.exit(0);
}).catch(console.error);
