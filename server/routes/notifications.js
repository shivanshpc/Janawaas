const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { authenticate } = require('../middleware/auth');

// Get user's notifications
router.get('/', authenticate, async (req, res) => {
    try {
        const { limit = 50, skip = 0, unreadOnly } = req.query;
        
        let query = { userId: req.user._id };
        if (unreadOnly === 'true') {
            query.isRead = false;
        }

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip))
            .lean();

        const unreadCount = await Notification.countDocuments({ 
            userId: req.user._id, 
            isRead: false 
        });

        res.json({ 
            notifications,
            unreadCount
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ error: 'Error fetching notifications' });
    }
});

// Mark notification as read
router.patch('/:id/read', authenticate, async (req, res) => {
    try {
        const notification = await Notification.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        notification.isRead = true;
        await notification.save();

        res.json({ 
            message: 'Notification marked as read',
            notification 
        });
    } catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({ error: 'Error updating notification' });
    }
});

// Mark all notifications as read
router.patch('/mark-all-read', authenticate, async (req, res) => {
    try {
        await Notification.updateMany(
            { userId: req.user._id, isRead: false },
            { isRead: true }
        );

        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Mark all notifications read error:', error);
        res.status(500).json({ error: 'Error updating notifications' });
    }
});

// Delete notification
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const notification = await Notification.findOneAndDelete({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        res.json({ message: 'Notification deleted' });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ error: 'Error deleting notification' });
    }
});

// Get unread count
router.get('/unread/count', authenticate, async (req, res) => {
    try {
        const count = await Notification.countDocuments({ 
            userId: req.user._id, 
            isRead: false 
        });

        res.json({ count });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({ error: 'Error fetching count' });
    }
});

module.exports = router;
