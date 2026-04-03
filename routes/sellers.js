const express = require('express');
const bcrypt = require('bcryptjs');
const Seller = require('../models/Seller');
const { generateOTP, sendOTPEmail, sendWelcomeEmail } = require('../services/emailService');
const router = express.Router();

// In-memory storage for OTPs and temporary data (in production, use Redis or database)
const otpStorage = new Map();
const lockoutStorage = new Map(); // For tracking account lockouts
const resendCooldown = new Map(); // For tracking resend cooldowns
const forgotPasswordStorage = new Map(); // For tracking forgot password OTPs

// Create a test seller account for testing
const createTestSeller = async () => {
  try {
    // Check if test seller already exists
    const existingSeller = await Seller.findOne({ email: 'test@seller.com' });
    if (existingSeller) {
      console.log('✅ Test seller account already exists:');
      console.log('   Email: test@seller.com');
      console.log('   Password: Test123!');
      return;
    }

    const testSeller = new Seller({
      name: 'Test Seller',
      email: 'test@seller.com',
      phoneNumber: '+256700000000',
      password: 'Test123!', // Will be hashed by pre-save middleware
      verified: true,
      status: 'active',
      shop: {
        name: 'Test Shop',
        description: 'A test shop for development',
        isSetup: true
      }
    });

    await testSeller.save();
    console.log('✅ Test seller account created in database:');
    console.log('   Email: test@seller.com');
    console.log('   Password: Test123!');
    console.log('');
  } catch (error) {
    console.error('Error creating test seller:', error);
  }
};

// Initialize test seller account
createTestSeller();

// Validation endpoint to check for credential conflicts
router.post('/validate-credentials', async (req, res) => {
  try {
    const { email, phoneNumber } = req.body;
    
    if (!email && !phoneNumber) {
      return res.status(400).json({
        message: 'Email or phone number is required for validation',
        error: 'Missing validation parameters'
      });
    }
    
    const conflicts = [];
    const available = [];
    
    // Check email conflict in sellers
    if (email) {
      const existingSeller = await Seller.findOne({ email: email.toLowerCase() });
      if (existingSeller) {
        conflicts.push({
          field: 'email',
          value: email,
          type: 'seller',
          message: 'Email already registered as seller'
        });
      } else {
        available.push({
          field: 'email',
          value: email,
          message: 'Email available for seller registration'
        });
      }
    }
    
    // Check phone number conflict in sellers
    if (phoneNumber) {
      const existingSellerPhone = await Seller.findOne({ phoneNumber });
      if (existingSellerPhone) {
        conflicts.push({
          field: 'phoneNumber',
          value: phoneNumber,
          type: 'seller',
          message: 'Phone number already registered as seller'
        });
      } else {
        available.push({
          field: 'phoneNumber',
          value: phoneNumber,
          message: 'Phone number available for seller registration'
        });
      }
    }
    
    const hasConflicts = conflicts.length > 0;
    const conflictTypes = conflicts.map(c => c.type);
    
    if (hasConflicts) {
      return res.status(409).json({
        message: 'Credential conflicts detected',
        hasConflicts: true,
        conflicts: conflicts,
        suggestion: conflictTypes.includes('user') 
          ? 'This email/phone is registered as a customer. Please use different credentials or login as a customer first.'
          : 'Please use different email and phone number for your seller account.'
      });
    }
    
    res.status(200).json({
      message: 'Credentials available for registration',
      hasConflicts: false,
      available: available
    });
    
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      message: 'Internal server error during validation',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// Strong password validation function
const validatePassword = (password) => {
  const errors = [];
  
  // Minimum length
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  // Maximum length (reasonable limit)
  if (password.length > 128) {
    errors.push('Password must be less than 128 characters');
  }
  
  // Must contain at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  // Must contain at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  // Must contain at least one number
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  // Must contain at least one special character (but not too restrictive)
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)');
  }
  
  // Check for common weak patterns
  const commonPatterns = [
    /^(.)\1+$/, // All same character
    /^(012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i, // Sequential
    /^(password|123456|qwerty|admin|user|login)/i // Common weak passwords
  ];
  
  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      errors.push('Password contains common weak patterns. Please choose a more secure password');
      break;
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
};

// Seller registration endpoint
// Seller registration endpoint
router.post('/register', async (req, res) => {
  try {
    const { name, email, phoneNumber, password } = req.body;
    
    // Validate required fields
    if (!name || !email || !phoneNumber || !password) {
      return res.status(400).json({
        message: 'All fields are required',
        error: 'Missing required fields'
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: 'Invalid email format',
        error: 'Please enter a valid email address'
      });
    }
    
    // Validate phone number format
    const phoneRegex = /^\+\d{10,15}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        message: 'Invalid phone number format',
        error: 'Phone number must start with + and contain 10-15 digits'
      });
    }
    
    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        message: 'Password does not meet security requirements',
        error: passwordValidation.errors.join('. ')
      });
    }
    
    // Check for existing seller with same email or phone
    const existingSeller = await Seller.findOne({
      $or: [
        { email: email.toLowerCase() },
        { phoneNumber: phoneNumber }
      ]
    });
    
    if (existingSeller) {
      const conflictField = existingSeller.email === email.toLowerCase() ? 'email' : 'phone number';
      return res.status(409).json({
        message: 'Registration conflicts detected',
        error: `This ${conflictField} is already registered as a seller account`,
        suggestion: 'Please use different credentials or try logging in if you already have an account.'
      });
    }
    
    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP with expiration (10 minutes)
    otpStorage.set(email, {
      otp: otp,
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
      attempts: 0,
      sellerData: { name, email, phoneNumber, password } // Store plain password, will be hashed when saving to DB
    });
    
    console.log('OTP stored for email:', email, 'OTP:', otp);
    console.log('Current OTP storage keys:', Array.from(otpStorage.keys()));
    
    // Send OTP email
    const emailResult = await sendOTPEmail(email, name, otp);
    
    if (!emailResult.success) {
      console.log('Failed to send email:', emailResult.error);
      return res.status(500).json({
        message: 'Failed to send verification email',
        error: 'Please try again or contact support'
      });
    }
    
    console.log('OTP email sent successfully to:', email);
    
    res.status(200).json({
      message: 'Registration successful! Please check your email for the verification code.',
      success: true
    });
    
  } catch (error) {
    console.error('Seller registration error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// OTP verification endpoint
router.post('/verify', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    console.log('OTP verification request received:', { email, otp, body: req.body });
    
    if (!email || !otp) {
      console.log('Missing email or OTP:', { email: !!email, otp: !!otp });
      return res.status(400).json({
        message: 'Email and OTP are required',
        error: 'Missing required fields'
      });
    }
    
    // Check if account is locked
    const lockoutData = lockoutStorage.get(email);
    if (lockoutData && Date.now() < lockoutData.lockedUntil) {
      const remainingTime = Math.ceil((lockoutData.lockedUntil - Date.now()) / (1000 * 60));
      console.log('Account locked for email:', email, 'Remaining time:', remainingTime, 'minutes');
      return res.status(429).json({
        message: 'Account temporarily locked',
        error: `Too many failed attempts. Account locked for ${remainingTime} more minutes.`,
        lockedUntil: lockoutData.lockedUntil,
        remainingMinutes: remainingTime
      });
    }
    
    // Get stored OTP data
    const storedData = otpStorage.get(email);
    console.log('Stored OTP data found:', !!storedData);
    
    if (!storedData) {
      console.log('No stored data for email:', email);
      console.log('Available emails in storage:', Array.from(otpStorage.keys()));
      return res.status(400).json({
        message: 'No verification request found',
        error: 'Please request a new verification code'
      });
    }
    
    // Check if OTP has expired
    if (Date.now() > storedData.expires) {
      console.log('OTP expired for email:', email);
      otpStorage.delete(email);
      return res.status(400).json({
        message: 'Verification code has expired',
        error: 'Please request a new verification code'
      });
    }
    
    // Verify OTP
    console.log('Comparing OTPs:', { received: otp, stored: storedData.otp });
    if (storedData.otp !== otp) {
      storedData.attempts += 1;
      console.log('OTP mismatch, attempts now:', storedData.attempts);
      
      // Check if this is the 5th failed attempt
      if (storedData.attempts >= 5) {
        // Lock account for 30 minutes
        const lockUntil = Date.now() + 30 * 60 * 1000; // 30 minutes
        lockoutStorage.set(email, {
          lockedUntil: lockUntil,
          reason: 'Too many failed OTP attempts'
        });
        
        // Clean up OTP storage
        otpStorage.delete(email);
        
        console.log('Account locked for email:', email, 'until:', new Date(lockUntil));
        
        return res.status(429).json({
          message: 'Account locked due to too many failed attempts',
          error: 'Your account has been temporarily locked for 30 minutes due to 5 failed verification attempts. Please try again later.',
          lockedUntil: lockUntil,
          remainingMinutes: 30
        });
      }
      
      return res.status(400).json({
        message: 'Invalid verification code',
        error: `Incorrect verification code. ${5 - storedData.attempts} attempts remaining before account lockout.`,
        attemptsRemaining: 5 - storedData.attempts,
        isWrongOtp: true
      });
    }
    
    // OTP is valid, create seller account in database
    const newSeller = new Seller({
      name: storedData.sellerData.name,
      email: storedData.sellerData.email,
      phoneNumber: storedData.sellerData.phoneNumber,
      password: storedData.sellerData.password, // Will be hashed by pre-save middleware
      verified: true,
      status: 'active'
    });
    
    // Save seller to database
    const savedSeller = await newSeller.save();
    
    // Clean up OTP storage and any lockout data
    otpStorage.delete(email);
    lockoutStorage.delete(email);
    resendCooldown.delete(email);
    
    console.log('Seller account created successfully in database:', savedSeller._id);
    
    // Send welcome email
    await sendWelcomeEmail(email, savedSeller.name);
    
    res.status(200).json({
      message: 'Account verified successfully!',
      success: true,
      seller: {
        id: savedSeller._id,
        name: savedSeller.name,
        email: savedSeller.email
      }
    });
    
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// Resend OTP endpoint
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        message: 'Email is required',
        error: 'Missing email address'
      });
    }
    
    // Check if account is locked
    const lockoutData = lockoutStorage.get(email);
    if (lockoutData && Date.now() < lockoutData.lockedUntil) {
      const remainingTime = Math.ceil((lockoutData.lockedUntil - Date.now()) / (1000 * 60));
      return res.status(429).json({
        message: 'Account temporarily locked',
        error: `Account locked for ${remainingTime} more minutes due to failed attempts.`,
        lockedUntil: lockoutData.lockedUntil,
        remainingMinutes: remainingTime
      });
    }
    
    // Check resend cooldown (3 minutes)
    const cooldownData = resendCooldown.get(email);
    if (cooldownData && Date.now() < cooldownData.nextAllowedResend) {
      const remainingTime = Math.ceil((cooldownData.nextAllowedResend - Date.now()) / 1000);
      const minutes = Math.floor(remainingTime / 60);
      const seconds = remainingTime % 60;
      
      return res.status(429).json({
        message: 'Resend cooldown active',
        error: `Please wait ${minutes > 0 ? `${minutes}m ` : ''}${seconds}s before requesting a new code.`,
        cooldownUntil: cooldownData.nextAllowedResend,
        remainingSeconds: remainingTime
      });
    }
    
    const storedData = otpStorage.get(email);
    
    if (!storedData) {
      return res.status(400).json({
        message: 'No verification request found',
        error: 'Please start the registration process again'
      });
    }
    
    // Generate new OTP
    const otp = generateOTP();
    
    // Update stored data
    storedData.otp = otp;
    storedData.expires = Date.now() + 10 * 60 * 1000; // 10 minutes
    storedData.attempts = 0; // Reset attempts on resend
    
    // Set resend cooldown (3 minutes)
    resendCooldown.set(email, {
      nextAllowedResend: Date.now() + 3 * 60 * 1000, // 3 minutes
      lastResent: Date.now()
    });
    
    console.log('New OTP generated for resend:', email, 'OTP:', otp);
    console.log('Resend cooldown set until:', new Date(Date.now() + 3 * 60 * 1000));
    
    // Send new OTP email
    const emailResult = await sendOTPEmail(email, storedData.sellerData.name, otp);
    
    if (!emailResult.success) {
      return res.status(500).json({
        message: 'Failed to send verification email',
        error: 'Please try again or contact support'
      });
    }
    
    res.status(200).json({
      message: 'New verification code sent to your email',
      success: true,
      cooldownUntil: Date.now() + 3 * 60 * 1000
    });
    
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// Debug endpoint to list all sellers (remove in production)
router.get('/debug/list-sellers', async (req, res) => {
  try {
    const sellers = await Seller.find({}, 'name email verified status createdAt shop.shopName').lean();
    
    res.json({
      message: 'Current sellers in database',
      sellers: sellers.map(seller => ({
        id: seller._id,
        name: seller.name,
        email: seller.email,
        verified: seller.verified,
        status: seller.status,
        shopName: seller.shop?.shopName || 'Not set up',
        createdAt: seller.createdAt
      })),
      count: sellers.length
    });
  } catch (error) {
    console.error('Error fetching sellers:', error);
    res.status(500).json({
      message: 'Error fetching sellers',
      error: error.message
    });
  }
});

// Seller login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log(`🔐 Login attempt for email: ${email}`);
    
    if (!email || !password) {
      console.log('❌ Missing email or password');
      return res.status(400).json({
        message: 'Email and password are required',
        error: 'Missing required fields'
      });
    }
    
    // Get seller from database
    const seller = await Seller.findOne({ email: email.toLowerCase() });
    
    if (!seller) {
      console.log(`❌ No seller found for email: ${email}`);
      return res.status(401).json({
        message: 'Invalid credentials',
        error: 'Email or password is incorrect'
      });
    }
    
    console.log(`✅ Seller found: ${seller.name}, Verified: ${seller.verified}`);
    
    if (!seller.verified) {
      console.log(`❌ Account not verified for: ${email}`);
      return res.status(401).json({
        message: 'Account not verified',
        error: 'Please verify your email address first'
      });
    }
    
    // Verify password using the model method
    const isPasswordValid = await seller.comparePassword(password);
    
    if (!isPasswordValid) {
      console.log(`❌ Invalid password for: ${email}`);
      return res.status(401).json({
        message: 'Invalid credentials',
        error: 'Email or password is incorrect'
      });
    }
    
    console.log(`✅ Login successful for: ${email}`);
    
    res.status(200).json({
      message: 'Login successful',
      success: true,
      seller: {
        id: seller._id,
        name: seller.name,
        email: seller.email,
        phoneNumber: seller.phoneNumber,
        shop: seller.shop
      }
    });
    
  } catch (error) {
    console.error('Seller login error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// Forgot Password - Send OTP
router.post('/forgot-password-seller', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        message: 'Email is required',
        error: 'Please provide your email address'
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: 'Invalid email format',
        error: 'Please enter a valid email address'
      });
    }
    
    // Check if seller exists
    const seller = await Seller.findOne({ email: email.toLowerCase() });
    if (!seller) {
      return res.status(404).json({
        message: 'Account not found',
        error: 'No seller account found with this email address'
      });
    }
    
    // Check if account is verified
    if (!seller.verified) {
      return res.status(400).json({
        message: 'Account not verified',
        error: 'Please verify your account first before resetting password'
      });
    }
    
    // Generate OTP for password reset
    const otp = generateOTP();
    
    // Store OTP with expiration (10 minutes)
    forgotPasswordStorage.set(email, {
      otp: otp,
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
      attempts: 0,
      verified: false
    });
    
    console.log('Password reset OTP generated for:', email, 'OTP:', otp);
    
    // Send OTP email
    const emailResult = await sendOTPEmail(email, seller.name, otp, 'Password Reset');
    
    if (!emailResult.success) {
      console.log('Failed to send password reset email:', emailResult.error);
      return res.status(500).json({
        message: 'Failed to send reset email',
        error: 'Please try again or contact support'
      });
    }
    
    console.log('Password reset OTP email sent successfully to:', email);
    
    res.status(200).json({
      message: 'Password reset code sent to your email',
      success: true
    });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// Verify Forgot Password OTP
router.post('/verify-forgot-password-seller', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({
        message: 'Email and OTP are required',
        error: 'Missing required fields'
      });
    }
    
    // Get stored OTP data
    const storedData = forgotPasswordStorage.get(email);
    
    if (!storedData) {
      return res.status(400).json({
        message: 'No password reset request found',
        error: 'Please request a new password reset'
      });
    }
    
    // Check if OTP has expired
    if (Date.now() > storedData.expires) {
      forgotPasswordStorage.delete(email);
      return res.status(400).json({
        message: 'Reset code has expired',
        error: 'Please request a new password reset'
      });
    }
    
    // Verify OTP
    if (storedData.otp !== otp) {
      storedData.attempts += 1;
      
      // Limit attempts to prevent brute force
      if (storedData.attempts >= 5) {
        forgotPasswordStorage.delete(email);
        return res.status(429).json({
          message: 'Too many failed attempts',
          error: 'Password reset request has been cancelled due to too many failed attempts. Please start over.'
        });
      }
      
      return res.status(400).json({
        message: 'Invalid reset code',
        error: `Incorrect code. ${5 - storedData.attempts} attempts remaining.`,
        attemptsRemaining: 5 - storedData.attempts
      });
    }
    
    // Mark as verified
    storedData.verified = true;
    
    console.log('Password reset OTP verified for:', email);
    
    res.status(200).json({
      message: 'Reset code verified successfully',
      success: true
    });
    
  } catch (error) {
    console.error('Verify forgot password OTP error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// Reset Password
router.post('/reset-password-seller', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    
    if (!email || !newPassword) {
      return res.status(400).json({
        message: 'Email and new password are required',
        error: 'Missing required fields'
      });
    }
    
    // Check if OTP was verified
    const resetData = forgotPasswordStorage.get(email);
    if (!resetData || !resetData.verified) {
      return res.status(400).json({
        message: 'Password reset not authorized',
        error: 'Please verify your reset code first'
      });
    }
    
    // Check if reset session has expired
    if (Date.now() > resetData.expires) {
      forgotPasswordStorage.delete(email);
      return res.status(400).json({
        message: 'Reset session has expired',
        error: 'Please start the password reset process again'
      });
    }
    
    // Validate new password strength
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        message: 'Password does not meet security requirements',
        error: passwordValidation.errors.join('. ')
      });
    }
    
    // Get seller account
    const seller = await Seller.findOne({ email: email.toLowerCase() });
    if (!seller) {
      return res.status(404).json({
        message: 'Account not found',
        error: 'Seller account not found'
      });
    }
    
    // Update seller password (let pre-save middleware handle hashing)
    seller.password = newPassword;
    seller.passwordResetAt = new Date();
    await seller.save();
    
    // Clean up reset data
    forgotPasswordStorage.delete(email);
    
    console.log('Password reset successfully for:', email);
    
    res.status(200).json({
      message: 'Password reset successfully',
      success: true
    });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// Get seller profile with complete information
router.get('/profile/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;
    
    const seller = await Seller.findById(sellerId).lean();
    
    if (!seller) {
      return res.status(404).json({
        message: 'Seller not found',
        error: 'Invalid seller ID'
      });
    }
    
    // Return seller profile without sensitive data
    const profile = {
      id: seller._id,
      name: seller.name,
      email: seller.email,
      phoneNumber: seller.phoneNumber,
      verified: seller.verified,
      status: seller.status,
      createdAt: seller.createdAt,
      profileImage: seller.profileImage || null,
      shop: seller.shop || {
        shopName: '',
        shopDescription: '',
        businessType: '',
        businessAddress: '',
        city: '',
        website: '',
        businessLicense: '',
        taxId: '',
        isSetup: false
      }
    };
    
    res.status(200).json({
      message: 'Seller profile retrieved successfully',
      success: true,
      profile: profile
    });
    
  } catch (error) {
    console.error('Get seller profile error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong'
    });
  }
});

// Update seller profile information
router.put('/profile/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { name, email, phoneNumber } = req.body;
    
    // Validate required fields
    if (!name || !email || !phoneNumber) {
      return res.status(400).json({
        message: 'Name, email, and phone number are required',
        error: 'Missing required fields'
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: 'Invalid email format',
        error: 'Please enter a valid email address'
      });
    }
    
    // Validate phone number format
    const phoneRegex = /^\+\d{10,15}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        message: 'Invalid phone number format',
        error: 'Phone number must start with + and contain 10-15 digits'
      });
    }
    
    // Check if seller exists
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        message: 'Seller not found',
        error: 'Invalid seller ID'
      });
    }
    
    // Check for conflicts with other sellers (only if email or phone changed)
    if (email !== seller.email || phoneNumber !== seller.phoneNumber) {
      const conflictQuery = {
        _id: { $ne: sellerId }, // Exclude current seller
        $or: []
      };
      
      if (email !== seller.email) {
        conflictQuery.$or.push({ email: email.toLowerCase() });
      }
      
      if (phoneNumber !== seller.phoneNumber) {
        conflictQuery.$or.push({ phoneNumber: phoneNumber });
      }
      
      if (conflictQuery.$or.length > 0) {
        const existingSeller = await Seller.findOne(conflictQuery);
        if (existingSeller) {
          const conflictField = existingSeller.email === email.toLowerCase() ? 'email' : 'phone number';
          return res.status(409).json({
            message: 'Profile update conflicts detected',
            error: `This ${conflictField} is already registered by another seller`
          });
        }
      }
    }
    
    // Update seller profile
    seller.name = name.trim();
    seller.email = email.toLowerCase().trim();
    seller.phoneNumber = phoneNumber.trim();
    seller.updatedAt = new Date();
    
    await seller.save();
    
    // Return updated profile
    const updatedProfile = {
      id: seller._id,
      name: seller.name,
      email: seller.email,
      phoneNumber: seller.phoneNumber,
      verified: seller.verified,
      status: seller.status,
      createdAt: seller.createdAt,
      updatedAt: seller.updatedAt,
      profileImage: seller.profileImage || null,
      shop: seller.shop || {
        shopName: '',
        shopDescription: '',
        businessType: '',
        businessAddress: '',
        city: '',
        website: '',
        businessLicense: '',
        taxId: '',
        isSetup: false
      }
    };
    
    res.status(200).json({
      message: 'Profile updated successfully',
      success: true,
      profile: updatedProfile
    });
    
  } catch (error) {
    console.error('Update seller profile error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong'
    });
  }
});

// Change seller password
router.put('/change-password/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { currentPassword, newPassword } = req.body;
    
    // Validate required fields
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: 'Current password and new password are required',
        error: 'Missing required fields'
      });
    }
    
    // Validate new password strength
    const validatePassword = (password) => {
      const errors = [];
      
      if (password.length < 8) {
        errors.push('At least 8 characters long');
      }
      
      if (!/[a-z]/.test(password)) {
        errors.push('One lowercase letter');
      }
      
      if (!/[A-Z]/.test(password)) {
        errors.push('One uppercase letter');
      }
      
      if (!/\d/.test(password)) {
        errors.push('One number');
      }
      
      if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('One special character');
      }
      
      return {
        isValid: errors.length === 0,
        errors: errors
      };
    };
    
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        message: 'Password does not meet security requirements',
        error: `Password must have: ${passwordValidation.errors.join(', ')}`
      });
    }
    
    // Check if seller exists
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        message: 'Seller not found',
        error: 'Invalid seller ID'
      });
    }
    
    // Verify current password
    const isCurrentPasswordValid = await seller.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        message: 'Current password is incorrect',
        error: 'Please enter your correct current password'
      });
    }
    
    // Check if new password is different from current
    const isSamePassword = await seller.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        message: 'New password must be different from current password',
        error: 'Please choose a different password'
      });
    }
    
    // Update seller password (let the model's pre-save middleware handle hashing)
    seller.password = newPassword;
    seller.passwordChangedAt = new Date();
    await seller.save();
    
    console.log(`Password changed successfully for seller: ${seller.email}`);
    
    res.status(200).json({
      message: 'Password changed successfully',
      success: true
    });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// Update seller profile image
router.put('/profile-image/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { profileImage } = req.body;
    
    // Validate required fields
    if (!profileImage || !profileImage.url || !profileImage.fileId) {
      return res.status(400).json({
        message: 'Profile image data is required',
        error: 'Missing profile image information'
      });
    }
    
    // Find seller
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        message: 'Seller not found',
        error: 'Invalid seller ID'
      });
    }
    
    // Update seller profile image
    seller.profileImage = {
      url: profileImage.url,
      fileId: profileImage.fileId,
      thumbnailUrl: profileImage.thumbnailUrl,
      fileName: profileImage.fileName,
      uploaded: true,
      updatedAt: new Date()
    };
    
    await seller.save();
    
    console.log(`Profile image updated for seller: ${seller.email}`);
    
    res.status(200).json({
      message: 'Profile image updated successfully',
      success: true,
      profileImage: seller.profileImage
    });
    
  } catch (error) {
    console.error('Update profile image error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// Delete seller profile image
router.delete('/profile-image/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;
    
    // Find seller
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        message: 'Seller not found',
        error: 'Invalid seller ID'
      });
    }
    
    // Remove profile image
    seller.profileImage = null;
    await seller.save();
    
    console.log(`Profile image removed for seller: ${seller.email}`);
    
    res.status(200).json({
      message: 'Profile image removed successfully',
      success: true
    });
    
  } catch (error) {
    console.error('Remove profile image error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// Shop setup endpoint
// Shop setup endpoint
router.post('/shop-setup', async (req, res) => {
  try {
    const { 
      sellerId, 
      shopName, 
      shopDescription, 
      businessType, 
      businessAddress, 
      city, 
      website, 
      businessLicense, 
      taxId,
      shopLogo,
      shopBanner 
    } = req.body;
    
    if (!sellerId) {
      return res.status(400).json({
        message: 'Seller ID is required',
        error: 'Missing seller identification'
      });
    }
    
    // Validate required shop fields
    if (!shopName || !shopDescription || !businessType || !businessAddress || !city) {
      return res.status(400).json({
        message: 'Required shop information missing',
        error: 'Shop name, description, business type, address, and city are required'
      });
    }
    
    // Validate shop name length
    if (shopName.length < 3) {
      return res.status(400).json({
        message: 'Shop name too short',
        error: 'Shop name must be at least 3 characters long'
      });
    }
    
    // Validate description length
    if (shopDescription.length < 20) {
      return res.status(400).json({
        message: 'Shop description too short',
        error: 'Shop description must be at least 20 characters long'
      });
    }
    
    // Validate website URL if provided
    if (website && website.trim()) {
      const urlRegex = /^https?:\/\/.+\..+/;
      if (!urlRegex.test(website)) {
        return res.status(400).json({
          message: 'Invalid website URL',
          error: 'Website must be a valid URL starting with http:// or https://'
        });
      }
    }
    
    // Find the seller in database
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        message: 'Seller not found',
        error: 'Invalid seller ID'
      });
    }
    
    // Initialize shop object if it doesn't exist
    if (!seller.shop) {
      seller.shop = {};
    }
    
    // Process shop logo and banner images
    let processedLogo = null;
    let processedBanner = null;
    
    if (shopLogo) {
      if (shopLogo.imagekitUrl) {
        // Image already uploaded to ImageKit
        processedLogo = {
          url: shopLogo.imagekitUrl,
          fileId: shopLogo.imagekitFileId,
          thumbnailUrl: shopLogo.imagekitThumbnail,
          fileName: shopLogo.fileName,
          uploaded: true
        };
      } else if (shopLogo.base64) {
        // Image needs to be uploaded to ImageKit
        try {
          const ImageKit = require('@imagekit/nodejs');
          const imagekit = new ImageKit({
            publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
            privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
          });
          
          const uploadResult = await imagekit.upload({
            file: shopLogo.base64,
            fileName: shopLogo.fileName || `logo_${sellerId}_${Date.now()}.jpg`,
            folder: 'sellers/logos',
            useUniqueFileName: true,
            tags: ['seller', 'logo', 'shop-setup']
          });
          
          processedLogo = {
            url: uploadResult.url,
            fileId: uploadResult.fileId,
            thumbnailUrl: uploadResult.thumbnailUrl,
            fileName: uploadResult.name,
            uploaded: true
          };
          
          console.log('Shop logo uploaded to ImageKit:', uploadResult.fileId);
        } catch (uploadError) {
          console.error('Failed to upload shop logo to ImageKit:', uploadError);
          // Continue without logo rather than failing the entire setup
          processedLogo = null;
        }
      }
    }
    
    if (shopBanner) {
      if (shopBanner.imagekitUrl) {
        // Image already uploaded to ImageKit
        processedBanner = {
          url: shopBanner.imagekitUrl,
          fileId: shopBanner.imagekitFileId,
          thumbnailUrl: shopBanner.imagekitThumbnail,
          fileName: shopBanner.fileName,
          uploaded: true
        };
      } else if (shopBanner.base64) {
        // Image needs to be uploaded to ImageKit
        try {
          const ImageKit = require('@imagekit/nodejs');
          const imagekit = new ImageKit({
            publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
            privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
          });
          
          const uploadResult = await imagekit.upload({
            file: shopBanner.base64,
            fileName: shopBanner.fileName || `banner_${sellerId}_${Date.now()}.jpg`,
            folder: 'sellers/banners',
            useUniqueFileName: true,
            tags: ['seller', 'banner', 'shop-setup']
          });
          
          processedBanner = {
            url: uploadResult.url,
            fileId: uploadResult.fileId,
            thumbnailUrl: uploadResult.thumbnailUrl,
            fileName: uploadResult.name,
            uploaded: true
          };
          
          console.log('Shop banner uploaded to ImageKit:', uploadResult.fileId);
        } catch (uploadError) {
          console.error('Failed to upload shop banner to ImageKit:', uploadError);
          // Continue without banner rather than failing the entire setup
          processedBanner = null;
        }
      }
    }
    
    // Update seller's shop information
    seller.shop = {
      shopName: shopName.trim(),
      shopDescription: shopDescription.trim(),
      businessType: businessType.trim(),
      businessAddress: businessAddress.trim(),
      city: city.trim(),
      website: website ? website.trim() : '',
      businessLicense: businessLicense ? businessLicense.trim() : '',
      taxId: taxId ? taxId.trim() : '',
      logo: processedLogo,
      banner: processedBanner,
      isSetup: true,
      createdAt: new Date()
    };
    
    // Save updated seller
    await seller.save();
    
    console.log('Shop setup completed for seller:', sellerId);
    console.log('Shop name:', shopName);
    console.log('Business type:', businessType);
    console.log('City:', city);
    console.log('Logo uploaded:', !!processedLogo);
    console.log('Banner uploaded:', !!processedBanner);
    
    res.status(200).json({
      message: 'Shop setup completed successfully!',
      success: true,
      shop: {
        id: seller._id,
        shopName: seller.shop?.shopName || shopName,
        businessType: seller.shop?.businessType || businessType,
        city: seller.shop?.city || city,
        logo: processedLogo,
        banner: processedBanner
      }
    });
    
  } catch (error) {
    console.error('Shop setup error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// Get shop details for a seller
router.get('/shop/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;
    
    const seller = await Seller.findById(sellerId, 'shop');
    
    if (!seller || !seller.shop) {
      return res.status(404).json({
        message: 'Shop not found',
        error: 'No shop setup found for this seller'
      });
    }
    
    res.status(200).json({
      message: 'Shop details retrieved successfully',
      success: true,
      shop: seller.shop
    });
    
  } catch (error) {
    console.error('Get shop details error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong'
    });
  }
});

// Admin endpoint to check seller accounts (for development/testing)
router.get('/admin/sellers', async (req, res) => {
  try {
    const sellers = await Seller.find({}, 'name email phoneNumber verified createdAt shop')
      .lean()
      .sort({ createdAt: -1 });

    const formattedSellers = sellers.map(seller => ({
      email: seller.email,
      id: seller._id,
      name: seller.name,
      phoneNumber: seller.phoneNumber,
      verified: seller.verified,
      createdAt: seller.createdAt,
      shop: seller.shop ? {
        shopName: seller.shop.shopName,
        businessType: seller.shop.businessType,
        city: seller.shop.city,
        isSetup: seller.shop.isSetup,
        createdAt: seller.shop.createdAt
      } : null
    }));

    res.status(200).json({
      message: 'Seller accounts retrieved successfully',
      totalSellers: sellers.length,
      sellers: formattedSellers,
      storage: {
        totalOtpRequests: otpStorage.size,
        totalLockouts: lockoutStorage.size,
        totalResendCooldowns: resendCooldown.size,
        totalForgotPasswordRequests: forgotPasswordStorage.size
      }
    });
  } catch (error) {
    console.error('Admin sellers error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong'
    });
  }
});

// Admin endpoint to get seller count only
router.get('/admin/sellers/count', async (req, res) => {
  try {
    const totalSellers = await Seller.countDocuments();
    const verifiedSellers = await Seller.countDocuments({ verified: true });
    const unverifiedSellers = totalSellers - verifiedSellers;

    res.status(200).json({
      message: 'Seller count retrieved successfully',
      totalSellers: totalSellers,
      verifiedSellers: verifiedSellers,
      unverifiedSellers: unverifiedSellers,
      pendingOtpVerifications: otpStorage.size,
      accountsLocked: lockoutStorage.size
    });
  } catch (error) {
    console.error('Admin seller count error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong'
    });
  }
});

// Admin endpoint to clear all seller data (for development/testing only)
router.delete('/admin/clear-all', async (req, res) => {
  try {
    // Clear database sellers (be careful with this in production!)
    await Seller.deleteMany({});
    
    // Clear in-memory storage
    otpStorage.clear();
    lockoutStorage.clear();
    resendCooldown.clear();
    forgotPasswordStorage.clear();
    
    console.log('All seller data cleared from database and memory');
    
    res.status(200).json({
      message: 'All seller data cleared successfully',
      success: true,
      warning: 'All sellers have been removed from the database'
    });
  } catch (error) {
    console.error('Clear all data error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong'
    });
  }
});

// ── GET seller payment settings ──────────────────────────────────────────
router.get('/payment/:sellerId', async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.sellerId).select('payment');
    if (!seller) return res.status(404).json({ success: false, message: 'Seller not found' });
    res.json({ success: true, payment: seller.payment || {} });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── UPDATE seller payment settings + sync to all products ─────────────────
router.put('/payment/:sellerId', async (req, res) => {
  try {
    const { mtnName, mtnNumber, airtelName, airtelNumber, bankName, bankAccountName, bankAccountNumber, bankBranch, preferredMethod } = req.body;

    const update = {};
    if (mtnName !== undefined) update['payment.mtnName'] = mtnName;
    if (mtnNumber !== undefined) update['payment.mtnNumber'] = mtnNumber;
    if (airtelName !== undefined) update['payment.airtelName'] = airtelName;
    if (airtelNumber !== undefined) update['payment.airtelNumber'] = airtelNumber;
    if (bankName !== undefined) update['payment.bankName'] = bankName;
    if (bankAccountName !== undefined) update['payment.bankAccountName'] = bankAccountName;
    if (bankAccountNumber !== undefined) update['payment.bankAccountNumber'] = bankAccountNumber;
    if (bankBranch !== undefined) update['payment.bankBranch'] = bankBranch;
    if (preferredMethod !== undefined) update['payment.preferredMethod'] = preferredMethod;

    const seller = await Seller.findByIdAndUpdate(
      req.params.sellerId,
      { $set: update },
      { new: true }
    ).select('payment');

    if (!seller) return res.status(404).json({ success: false, message: 'Seller not found' });

    // Sync payment methods to ALL seller's products
    const Product = require('../models/Product');
    const paymentSync = {
      'paymentMethods.mtnName': mtnName || '',
      'paymentMethods.mtnNumber': mtnNumber || '',
      'paymentMethods.airtelName': airtelName || '',
      'paymentMethods.airtelNumber': airtelNumber || '',
      'paymentMethods.bankName': bankName || '',
      'paymentMethods.bankAccountName': bankAccountName || '',
      'paymentMethods.bankAccountNumber': bankAccountNumber || '',
      'paymentMethods.bankBranch': bankBranch || '',
      'paymentMethods.preferredMethod': preferredMethod || '',
    };

    const syncResult = await Product.updateMany(
      { sellerId: req.params.sellerId },
      { $set: paymentSync }
    );

    res.json({
      success: true,
      payment: seller.payment,
      productsUpdated: syncResult.modifiedCount,
    });
  } catch (err) {
    console.error('PUT payment error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;