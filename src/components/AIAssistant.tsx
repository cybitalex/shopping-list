import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Chip,
  alpha,
  useTheme,
  Collapse,
  IconButton,
  Divider,
} from '@mui/material';
import {
  Psychology as AIIcon,
  Send as SendIcon,
  ExpandLess,
  ExpandMore,
  SmartToy,
  Person as UserIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import type { Store } from '../types/store';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  aiProvider?: string;
}

interface AIAssistantProps {
  stores?: Store[];
  items?: Array<{ name: string }>;
  currentLocation?: { lat: number; lng: number };
}

const AIAssistant: React.FC<AIAssistantProps> = ({
  stores = [],
  items = [],
  currentLocation
}) => {
  const theme = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textFieldRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when chat updates
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, isLoading]);

  // Focus text field when expanded
  useEffect(() => {
    if (isExpanded && textFieldRef.current) {
      setTimeout(() => textFieldRef.current?.focus(), 100);
    }
  }, [isExpanded]);

  const handleSubmitQuery = async () => {
    if (!query.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: query.trim(),
      timestamp: new Date()
    };

    // Add user message to chat immediately
    setChatHistory(prev => [...prev, userMessage]);
    
    // Clear the input field immediately
    const currentQuery = query.trim();
    setQuery('');
    setIsLoading(true);

    try {
      // Prepare context for the AI
      const context = {
        storeCount: stores.length,
        itemCount: items.length,
        hasLocation: !!currentLocation,
        stores: stores.slice(0, 3).map(store => ({
          name: store.name,
          itemCount: store.items?.length || 0,
          hasDistanceInfo: !!store.distance
        })),
        items: items.map(item => item.name)
      };

      const response = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: currentQuery,
          context
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.success ? data.response : `Sorry, I couldn't process your question: ${data.error}`,
        timestamp: new Date(),
        aiProvider: data.source
      };

      setChatHistory(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error('AI Assistant error:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error while processing your question. Please try again.',
        timestamp: new Date()
      };
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      // Focus back to text field for next message
      setTimeout(() => textFieldRef.current?.focus(), 100);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmitQuery();
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    setQuery(question);
    textFieldRef.current?.focus();
  };

  const clearChat = () => {
    setChatHistory([]);
  };

  const suggestedQuestions = [
    "Which store offers the best overall value?",
    "What are some healthy alternatives to my current items?",
    "How can I save money on this shopping trip?",
    "Which items should I prioritize buying in bulk?",
    "Are there any seasonal deals I should know about?"
  ];

  return (
    <Paper
      sx={{
        mb: 3,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${alpha(theme.palette.secondary.main, 0.05)} 100%)`,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: alpha(theme.palette.primary.main, 0.1),
          cursor: 'pointer',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <SmartToy sx={{ color: theme.palette.primary.main, fontSize: 28 }} />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
              AI Shopping Assistant
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {chatHistory.length > 0 
                ? `${chatHistory.length} message${chatHistory.length === 1 ? '' : 's'}`
                : 'Ask me anything about your shopping list'
              }
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {chatHistory.length > 0 && (
            <IconButton 
              onClick={(e) => {
                e.stopPropagation();
                clearChat();
              }}
              size="small"
              sx={{ mr: 1 }}
            >
              <ClearIcon />
            </IconButton>
          )}
          <IconButton>
            {isExpanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        </Box>
      </Box>

      {/* Expandable Content */}
      <Collapse in={isExpanded}>
        <Box sx={{ p: 3 }}>
          {/* Chat History */}
          {chatHistory.length > 0 && (
            <Box
              ref={chatContainerRef}
              sx={{
                maxHeight: 400,
                overflowY: 'auto',
                mb: 3,
                p: 2,
                backgroundColor: alpha(theme.palette.background.default, 0.5),
                borderRadius: 2,
                border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
              }}
            >
              {chatHistory.map((message, index) => (
                <Box key={message.id}>
                  {index > 0 && <Divider sx={{ my: 2 }} />}
                  
                  {/* Message */}
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 2,
                      alignItems: 'flex-start',
                    }}
                  >
                    {/* Avatar */}
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: message.role === 'user' 
                          ? alpha(theme.palette.primary.main, 0.1)
                          : alpha(theme.palette.success.main, 0.1),
                        color: message.role === 'user'
                          ? theme.palette.primary.main
                          : theme.palette.success.main,
                        flexShrink: 0,
                      }}
                    >
                      {message.role === 'user' ? (
                        <UserIcon sx={{ fontSize: 18 }} />
                      ) : (
                        <SmartToy sx={{ fontSize: 18 }} />
                      )}
                    </Box>

                    {/* Message Content */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          {message.role === 'user' ? 'You' : 'AI Assistant'}
                        </Typography>
                        {message.role === 'assistant' && message.aiProvider && (
                          <Chip
                            label={message.aiProvider === 'open-webui' ? 'Open WebUI' : message.aiProvider}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.7rem', height: 20 }}
                          />
                        )}
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {message.content}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              ))}
              
              {/* Loading indicator */}
              {isLoading && (
                <Box>
                  <Divider sx={{ my: 2 }} />
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: alpha(theme.palette.success.main, 0.1),
                        color: theme.palette.success.main,
                      }}
                    >
                      <SmartToy sx={{ fontSize: 18 }} />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CircularProgress size={16} />
                      <Typography variant="body2" color="text.secondary">
                        AI is thinking...
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {/* Input Section */}
          <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
            <TextField
              fullWidth
              placeholder="Ask me about your shopping list, prices, alternatives, or money-saving tips..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              size="small"
              inputRef={textFieldRef}
              sx={{
                '& .MuiOutlinedInput-root': {
                  backgroundColor: theme.palette.background.paper,
                },
              }}
            />
            <Button
              variant="contained"
              onClick={handleSubmitQuery}
              disabled={!query.trim() || isLoading}
              sx={{ 
                minWidth: 44,
                height: 40,
                px: 2,
              }}
            >
              {isLoading ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <SendIcon sx={{ fontSize: 18 }} />
              )}
            </Button>
          </Box>

          {/* Suggested Questions */}
          {chatHistory.length === 0 && (
            <Box>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                Try asking:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {suggestedQuestions.map((question, index) => (
                  <Chip
                    key={index}
                    label={question}
                    variant="outlined"
                    size="small"
                    onClick={() => handleSuggestedQuestion(question)}
                    sx={{
                      cursor: 'pointer',
                      '&:hover': {
                        backgroundColor: alpha(theme.palette.primary.main, 0.1),
                      },
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
};

export default AIAssistant;
