const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email address',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    gender: {
      type: String,
      default: '',
    },
    resetOtp: {
      type: String,
      select: false, 
    },
    resetOtpExpiry: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};


userSchema.statics.updateOtpByEmail = async function (email, otpData) {
  return this.findOneAndUpdate(
    { email: email.toLowerCase() },
    { resetOtp: otpData.resetOtp, resetOtpExpiry: otpData.resetOtpExpiry },
    { new: true }
  );
};

userSchema.statics.updatePasswordByEmail = async function (email, hashedPassword) {
  return this.findOneAndUpdate(
    { email: email.toLowerCase() },
    { password: hashedPassword, resetOtp: undefined, resetOtpExpiry: undefined },
    { new: true }
  );
};

userSchema.statics.updateProfile = async function (id, profileData) {
  const user = await this.findById(id);
  if (!user) return null;
  if (profileData.name !== undefined) user.name = profileData.name;
  if (profileData.gender !== undefined) user.gender = profileData.gender;
  await user.save();
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    gender: user.gender || '',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

module.exports = mongoose.model('User', userSchema);
