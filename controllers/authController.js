const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const User = require('../models/User');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'supersecretkeychangeinproduction', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

const registerUser = async (req, res, next) => {
  const { name, email, password } = req.body;

  try {
    if (!name || !email || !password) {
      res.status(400);
      throw new Error('Please provide all required fields (name, email, password)');
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      res.status(400);
      throw new Error('User already exists with this email address');
    }

    const user = await User.create({
      name,
      email,
      password,
    });

    if (user) {
      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          gender: user.gender || '',
          token: generateToken(user._id),
        },
      });
    } else {
      res.status(400);
      throw new Error('Failed to register user. Invalid data provided');
    }
  } catch (error) {
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      res.status(400);
      throw new Error('Please provide both email and password');
    }

    const user = await User.findOne({ email }).select('+password');

    if (user && (await user.matchPassword(password))) {
      res.status(200).json({
        success: true,
        message: 'User authenticated successfully',
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          gender: user.gender || '',
          token: generateToken(user._id),
        },
      });
    } else {
      res.status(401);
      throw new Error('Invalid email or password');
    }
  } catch (error) {
    next(error);
  }
};

const getUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      res.status(200).json({
        success: true,
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          gender: user.gender || '',
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
    } else {
      res.status(404);
      throw new Error('User profile not found');
    }
  } catch (error) {
    next(error);
  }
};

const updateUserProfile = async (req, res, next) => {
  const { name, gender } = req.body;

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (gender !== undefined) updateData.gender = gender;

    const updatedUser = await User.updateProfile(req.user._id, updateData);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        gender: updatedUser.gender || '',
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  const { email } = req.body;

  try {
    if (!email) {
      res.status(400);
      throw new Error('Please provide an email address');
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(404);
      throw new Error('No account found with this email address');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);
    await User.updateOtpByEmail(email, { resetOtp: otp, resetOtpExpiry: otpExpiry });

    let emailSent = false;
    let mailSendError = null;
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.SMTP_USER || 'bilal@gensols.org',
          pass: process.env.smtp_password || 'ueux bypf nhyq txcq',
        },
      });

      const mailOptions = {
        from: `"Noor IslamicPro" <${process.env.SMTP_USER || 'bilal@gensols.org'}>`,
        to: email,
        subject: 'Password Reset OTP - Noor IslamicPro',
        text: `Your password reset OTP code is ${otp}. It will expire in 15 minutes.`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px; max-width: 600px; margin: auto;">
            <h2 style="color: #0d9488; text-align: center;">Noor IslamicPro</h2>
            <p>Assalamu Alaikum,</p>
            <p>You requested a password reset. Please use the following One-Time Password (OTP) to reset your password:</p>
            <div style="text-align: center; margin: 20px 0;">
              <span style="font-size: 28px; font-weight: bold; background-color: #f3f4f6; padding: 12px 24px; display: inline-block; border-radius: 8px; color: #111827; letter-spacing: 4px; border: 1px solid #e5e7eb;">
                ${otp}
              </span>
            </div>
            <p>This OTP is valid for 15 minutes. If you did not request a password reset, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin-top: 20px;" />
            <p style="font-size: 12px; color: #6b7280; text-align: center;">This is an automated email from Noor IslamicPro. Please do not reply.</p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      emailSent = true;
      console.log(`[Forgot Password] OTP email sent successfully to ${email}`);
    } catch (mailError) {
      mailSendError = mailError.message;
      console.error('[Forgot Password] SMTP mail send failed:', mailError.message);
    }

    if (!emailSent) {
      res.status(500);
      throw new Error(`Failed to send verification email. SMTP Error: ${mailSendError || 'Unknown error'}`);
    }

    console.log(`\n🔑 [DEVELOPMENT ONLY] OTP for ${email}: ${otp}\n`);

    res.status(200).json({
      success: true,
      message: 'A password reset OTP has been sent to your email.',
    });
  } catch (error) {
    next(error);
  }
};

const verifyOtp = async (req, res, next) => {
  const { email, otp } = req.body;

  try {
    if (!email || !otp) {
      res.status(400);
      throw new Error('Please provide email and OTP');
    }

    const user = await User.findOne({ email }).select('+resetOtp +resetOtpExpiry');
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    if (!user.resetOtp || user.resetOtp !== otp) {
      res.status(400);
      throw new Error('Invalid OTP code');
    }

    if (new Date() > new Date(user.resetOtpExpiry)) {
      res.status(400);
      throw new Error('OTP has expired. Please request a new one.');
    }

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully. You can now reset your password.',
    });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  const { email, otp, password } = req.body;

  try {
    if (!email || !otp || !password) {
      res.status(400);
      throw new Error('Please provide email, OTP and new password');
    }

    if (password.length < 6) {
      res.status(400);
      throw new Error('Password must be at least 6 characters');
    }

    const user = await User.findOne({ email }).select('+resetOtp +resetOtpExpiry');
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    if (!user.resetOtp || user.resetOtp !== otp) {
      res.status(400);
      throw new Error('Invalid OTP code');
    }

    if (new Date() > new Date(user.resetOtpExpiry)) {
      res.status(400);
      throw new Error('OTP has expired. Please request a new one.');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await User.updatePasswordByEmail(email, hashedPassword);

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now sign in with your new password.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  forgotPassword,
  verifyOtp,
  resetPassword,
};
