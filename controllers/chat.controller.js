const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { getIO, getOnlineUsers } = require('../config/socket');
const { uploadToCloudinary } = require('../middlewares/upload.middleware');

// @desc    Get all conversations for a user
// @route   GET /api/conversations
const getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
    })
      .populate('participants', 'name profilePic role')
      .populate('lastMessageSender', 'name')
      .sort({ updatedAt: -1 });

    // Add online status info
    const onlineUsers = getOnlineUsers();
    const conversationsWithStatus = conversations.map((conv) => {
      const otherParticipant = conv.participants.find(
        (p) => p._id.toString() !== req.user._id.toString()
      );
      return {
        ...conv.toObject(),
        otherParticipant,
        isOnline: onlineUsers.has(otherParticipant?._id.toString()),
      };
    });

    res.json({ success: true, conversations: conversationsWithStatus });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Get messages in a conversation
// @route   GET /api/conversations/:id/messages
const getMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Verify user is a participant
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }

    if (!conversation.participants.some((p) => p.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const messages = await Message.find({ conversation: id })
      .populate('sender', 'name profilePic')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Message.countDocuments({ conversation: id });

    res.json({
      success: true,
      messages: messages.reverse(), // Return in chronological order
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Start a new conversation (or get existing)
// @route   POST /api/conversations
const createConversation = async (req, res) => {
  try {
    const { participantId } = req.body;

    if (!participantId) {
      return res.status(400).json({ message: 'Participant ID is required.' });
    }

    if (participantId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot create conversation with yourself.' });
    }

    // Check if conversation already exists
    const existingConversation = await Conversation.findOne({
      participants: { $all: [req.user._id, participantId] },
    }).populate('participants', 'name profilePic role');

    if (existingConversation) {
      return res.json({ success: true, conversation: existingConversation });
    }

    // Create new conversation
    const conversation = await Conversation.create({
      participants: [req.user._id, participantId],
      unreadCounts: new Map([
        [req.user._id.toString(), 0],
        [participantId, 0],
      ]),
    });

    const populatedConversation = await Conversation.findById(conversation._id)
      .populate('participants', 'name profilePic role');

    res.status(201).json({ success: true, conversation: populatedConversation });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Send a message
// @route   POST /api/messages
const sendMessage = async (req, res) => {
  try {
    const { conversationId, content, type } = req.body;

    if (!conversationId) {
      return res.status(400).json({ message: 'Conversation ID is required.' });
    }

    if (!content && (!req.file)) {
      return res.status(400).json({ message: 'Message content is required.' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }

    if (!conversation.participants.some((p) => p.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const messageData = {
      conversation: conversationId,
      sender: req.user._id,
      content: content || '',
      type: type || 'text',
      readBy: [req.user._id],
    };

    // Handle file upload
    if (req.file) {
      const folder = req.file.mimetype.startsWith('image')
        ? 'educonnect/chat-images'
        : 'educonnect/chat-files';

      const result = await uploadToCloudinary(req.file, folder);
      messageData.fileUrl = result.secure_url;
      messageData.filePublicId = result.public_id;
      messageData.fileName = req.file.originalname;
      messageData.type = req.file.mimetype.startsWith('image') ? 'image' : 'file';
    }

    const message = await Message.create(messageData);

    // Update conversation's last message
    conversation.lastMessage = message.content || (message.fileName || 'File');
    conversation.lastMessageTime = message.createdAt;
    conversation.lastMessageSender = req.user._id;

    // Update unread counts for other participants
    for (const participantId of conversation.participants) {
      const pId = participantId.toString();
      if (pId !== req.user._id.toString()) {
        const currentCount = conversation.unreadCounts?.get(pId) || 0;
        conversation.unreadCounts.set(pId, currentCount + 1);
      }
    }

    await conversation.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'name profilePic');

    // Emit socket event to conversation room (all participants are joined)
    try {
      const io = getIO();
      // Emit only to the conversation room - all participants are already joined
      // via joinConversation, so both sender and recipient receive it once.
      // The sender should skip it client-side since they already added from REST.
      io.to(conversationId).emit('receive_message', populatedMessage);
    } catch (socketErr) {
      // Socket not available
    }

    res.status(201).json({ success: true, message: populatedMessage });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// @desc    Mark message as read
// @route   PUT /api/messages/:id/read
const markAsRead = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({ message: 'Message not found.' });
    }

    if (!message.readBy.includes(req.user._id)) {
      message.readBy.push(req.user._id);
      await message.save();
    }

    // Reset unread count in conversation
    const conversation = await Conversation.findById(message.conversation);
    if (conversation) {
      conversation.unreadCounts.set(req.user._id.toString(), 0);
      await conversation.save();
    }

    res.json({ success: true, message: 'Marked as read.' });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  getConversations,
  getMessages,
  createConversation,
  sendMessage,
  markAsRead,
};