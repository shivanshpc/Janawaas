const mongoose = require('mongoose');

const checklistItemSchema = new mongoose.Schema({
    checklistId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Checklist',
        required: true
    },
    description: {
        type: String,
        required: [true, 'Description is required'],
        trim: true
    },
    orderIndex: {
        type: Number,
        required: true,
        default: 0
    },
    isCompleted: {
        type: Boolean,
        default: false
    },
    proofUrl: {
        type: String,
        trim: true
    },
    completedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Authority'
    },
    completedAt: {
        type: Date
    }
});

// Indexes for performance
checklistItemSchema.index({ checklistId: 1 });
checklistItemSchema.index({ checklistId: 1, orderIndex: 1 });

module.exports = mongoose.model('ChecklistItem', checklistItemSchema);
