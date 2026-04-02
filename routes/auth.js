const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { generateUserOTP, sendUserOTPEmail, sendUserWelcomeEmail } = require('../services/emailService');
const router = express.Router();

// In-memory storage for OTPs (in production, use Redis or database)
const otpStorage = new Map();

// User registration with OTP
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
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

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        message: 'Password too short',
        error: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        message: 'User already exists',
        error: 'An account with this email already exists'
      });
    }

    // Generate 6-digit OTP for users
    const otp = generateUserOTP();

    // Store OTP with expiration (10 minutes)
    otpStorage.set(email, {
      otp: otp,
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
      attempts: 0,
      userData: { name, email, password } // Store plain password, will be hashed when saving to DB
    });

    console.log('OTP stored for user email:', email, 'OTP:', otp);

    // Send OTP email using user-focused template
    const emailResult = await sendUserOTPEmail(email, name, otp, 'Account Verification');

    if (!emailResult.success) {
      console.log('Failed to send email:', emailResult.error);
      return res.status(500).json({
        message: 'Failed to send verification email',
        error: 'Please try again or contact support'
      });
    }

    console.log('OTP email sent successfully to:', email);

    res.status(200).json({
      message: 'Registration initiated! Please check your email for the verification code.',
      success: true
    });

  } catch (error) {
    console.error('User registration error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// Verify OTP and complete registration
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    console.log('OTP verification request received:', { email, otp });

    if (!email || !otp) {
      console.log('Missing email or OTP:', { email: !!email, otp: !!otp });
      return res.status(400).json({
        message: 'Email and OTP are required',
        error: 'Missing required fields'
      });
    }

    // Get stored OTP data
    const storedData = otpStorage.get(email);
    console.log('Stored OTP data found:', !!storedData);

    if (!storedData) {
      console.log('No stored data for email:', email);
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
        otpStorage.delete(email);
        console.log('Too many failed attempts for email:', email);

        return res.status(429).json({
          message: 'Too many failed attempts',
          error: 'Verification request has been cancelled due to too many failed attempts. Please start over.',
        });
      }

      return res.status(400).json({
        message: 'Invalid verification code',
        error: `Incorrect verification code. ${5 - storedData.attempts} attempts remaining.`,
        attemptsRemaining: 5 - storedData.attempts,
        isWrongOtp: true
      });
    }

    // OTP is valid, create user account in database
    const newUser = new User({
      name: storedData.userData.name,
      email: storedData.userData.email,
      password: storedData.userData.password, // Will be hashed by pre-save middleware
      role: 'user'
    });

    // Save user to database
    const savedUser = await newUser.save();

    // Clean up OTP storage
    otpStorage.delete(email);

    console.log('User account created successfully in database:', savedUser._id);

    // Generate JWT token
    const token = jwt.sign(
      { userId: savedUser._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      message: 'Account verified and created successfully!',
      success: true,
      token,
      user: {
        id: savedUser._id,
        name: savedUser.name,
        email: savedUser.email,
        role: savedUser.role
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

// Resend OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;

    console.log('Resend OTP request received for email:', email);

    if (!email) {
      console.log('No email provided in resend request');
      return res.status(400).json({
        message: 'Email is required',
        error: 'Missing email address'
      });
    }

    const storedData = otpStorage.get(email);
    console.log('Stored data found for resend:', !!storedData);

    if (!storedData) {
      console.log('No stored data found for email:', email);
      console.log('Current OTP storage keys:', Array.from(otpStorage.keys()));
      return res.status(400).json({
        message: 'No verification request found',
        error: 'Please start the registration process again'
      });
    }

    // Generate new 6-digit OTP for users
    const otp = generateUserOTP();

    // Update stored data
    storedData.otp = otp;
    storedData.expires = Date.now() + 10 * 60 * 1000; // 10 minutes
    storedData.attempts = 0; // Reset attempts on resend

    console.log('New OTP generated for resend:', email, 'OTP:', otp);

    // Send new OTP email using user-focused template
    const emailResult = await sendUserOTPEmail(email, storedData.userData.name, otp, 'Account Verification');

    if (!emailResult.success) {
      console.log('Failed to send resend email:', emailResult.error);
      return res.status(500).json({
        message: 'Failed to send verification email',
        error: 'Please try again or contact support'
      });
    }

    console.log('Resend OTP email sent successfully to:', email);

    res.status(200).json({
      message: 'New verification code sent to your email',
      success: true
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log(`🔐 User login attempt for email: ${email}`);

    if (!email || !password) {
      console.log('❌ Missing email or password');
      return res.status(400).json({
        message: 'Email and password are required',
        error: 'Missing required fields'
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log(`❌ No user found for email: ${email}`);
      return res.status(401).json({
        message: 'Invalid credentials',
        error: 'Email or password is incorrect'
      });
    }

    console.log(`✅ User found: ${user.name}`);

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      console.log(`❌ Invalid password for: ${email}`);
      return res.status(401).json({
        message: 'Invalid credentials',
        error: 'Email or password is incorrect'
      });
    }

    console.log(`✅ Login successful for: ${email}`);

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('User login error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// User forgot password - send reset code
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    console.log('User forgot password request for:', email);

    if (!email) {
      return res.status(400).json({
        message: 'Email is required',
        error: 'Missing email address'
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

    // Check if user exists
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        message: 'Account not found',
        error: 'No account exists with this email address'
      });
    }

    // Generate 6-digit reset code
    const resetCode = generateUserOTP();

    // Store reset code with expiration (10 minutes)
    otpStorage.set(`reset_${email}`, {
      otp: resetCode,
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
      attempts: 0,
      userId: user._id
    });

    console.log('Reset code stored for user:', email, 'Code:', resetCode);

    // Send reset code email
    const emailResult = await sendUserOTPEmail(email, user.name, resetCode, 'Password Reset');

    if (!emailResult.success) {
      console.log('Failed to send reset email:', emailResult.error);
      return res.status(500).json({
        message: 'Failed to send reset code',
        error: 'Please try again or contact support'
      });
    }

    console.log('Reset code email sent successfully to:', email);

    res.status(200).json({
      message: 'Password reset code sent to your email',
      success: true
    });

  } catch (error) {
    console.error('User forgot password error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// Verify reset code
router.post('/verify-reset-code', async (req, res) => {
  try {
    const { email, otp } = req.body;

    console.log('Reset code verification request:', { email, otp });

    if (!email || !otp) {
      return res.status(400).json({
        message: 'Email and reset code are required',
        error: 'Missing required fields'
      });
    }

    // Get stored reset code data
    const storedData = otpStorage.get(`reset_${email}`);

    if (!storedData) {
      return res.status(400).json({
        message: 'No reset request found',
        error: 'Please request a new reset code'
      });
    }

    // Check if reset code has expired
    if (Date.now() > storedData.expires) {
      console.log('Reset code expired for:', email);
      otpStorage.delete(`reset_${email}`);
      return res.status(400).json({
        message: 'Reset code has expired',
        error: 'Please request a new reset code'
      });
    }

    // Verify reset code
    if (storedData.otp !== otp) {
      storedData.attempts += 1;

      // Check if this is the 5th failed attempt
      if (storedData.attempts >= 5) {
        otpStorage.delete(`reset_${email}`);
        return res.status(429).json({
          message: 'Too many failed attempts',
          error: 'Reset request cancelled due to too many failed attempts. Please start over.'
        });
      }

      return res.status(400).json({
        message: 'Invalid reset code',
        error: `Incorrect reset code. ${5 - storedData.attempts} attempts remaining.`
      });
    }

    // Reset code is valid - mark as verified
    storedData.verified = true;
    storedData.verifiedAt = Date.now();

    res.status(200).json({
      message: 'Reset code verified successfully',
      success: true
    });

  } catch (error) {
    console.error('Reset code verification error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// Reset password with verified code
router.post('/reset-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    console.log('Password reset request for:', email);

    if (!email || !newPassword) {
      return res.status(400).json({
        message: 'Email and new password are required',
        error: 'Missing required fields'
      });
    }

    // Validate password strength
    if (newPassword.length < 6) {
      return res.status(400).json({
        message: 'Password too short',
        error: 'Password must be at least 6 characters long'
      });
    }

    // Get stored reset data
    const storedData = otpStorage.get(`reset_${email}`);

    if (!storedData || !storedData.verified) {
      return res.status(400).json({
        message: 'Invalid reset session',
        error: 'Please verify your reset code first'
      });
    }

    // Check if verification is still valid (30 minutes after verification)
    if (Date.now() > storedData.verifiedAt + 30 * 60 * 1000) {
      otpStorage.delete(`reset_${email}`);
      return res.status(400).json({
        message: 'Reset session expired',
        error: 'Please start the password reset process again'
      });
    }

    // Find user and update password
    const user = await User.findById(storedData.userId);
    if (!user) {
      return res.status(404).json({
        message: 'User not found',
        error: 'Account no longer exists'
      });
    }

    // Update password (will be hashed by pre-save middleware)
    user.password = newPassword;
    await user.save();

    // Clean up reset data
    otpStorage.delete(`reset_${email}`);

    console.log('Password reset successful for:', email);

    res.status(200).json({
      message: 'Password reset successfully',
      success: true
    });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// Update user profile
router.put('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        message: 'Access denied',
        error: 'No token provided'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const { name, email, phone, address, dateOfBirth, gender, avatar, avatarFileId } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({
        message: 'Name and email are required',
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

    // Check if email is already taken by another user
    const existingUser = await User.findOne({ 
      email: email.toLowerCase(), 
      _id: { $ne: userId } 
    });
    
    if (existingUser) {
      return res.status(409).json({
        message: 'Email already taken',
        error: 'This email is already associated with another account'
      });
    }

    // Update user profile (simplified - no ImageKit cleanup needed)
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim(),
        address: address?.trim(),
        dateOfBirth: dateOfBirth?.trim(),
        gender: gender,
        avatar: avatar,
        avatarFileId: avatarFileId,
        updatedAt: new Date()
      },
      { new: true, select: '-password' }
    );

    if (!updatedUser) {
      return res.status(404).json({
        message: 'User not found',
        error: 'Account no longer exists'
      });
    }

    console.log('Profile updated successfully for user:', updatedUser.email);

    res.json({
      message: 'Profile updated successfully',
      success: true,
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        address: updatedUser.address,
        dateOfBirth: updatedUser.dateOfBirth,
        gender: updatedUser.gender,
        avatar: updatedUser.avatar,
        avatarFileId: updatedUser.avatarFileId,
        role: updatedUser.role
      }
    });

  } catch (error) {
    console.error('Profile update error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        message: 'Invalid token',
        error: 'Please login again'
      });
    }
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

// Change password
router.post('/change-password', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        message: 'Access denied',
        error: 'No token provided'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: 'Current password and new password are required',
        error: 'Missing required fields'
      });
    }

    // Validate new password strength
    if (newPassword.length < 6) {
      return res.status(400).json({
        message: 'Password too short',
        error: 'New password must be at least 6 characters long'
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        message: 'User not found',
        error: 'Account no longer exists'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        message: 'Invalid current password',
        error: 'Current password is incorrect'
      });
    }

    // Check if new password is different from current
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        message: 'Same password',
        error: 'New password must be different from current password'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    console.log('Password changed successfully for user:', user.email);

    res.json({
      message: 'Password changed successfully',
      success: true
    });

  } catch (error) {
    console.error('Change password error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        message: 'Invalid token',
        error: 'Please login again'
      });
    }
    res.status(500).json({
      message: 'Internal server error',
      error: 'Something went wrong. Please try again.'
    });
  }
});

module.exports = router;