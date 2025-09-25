import React, { useState } from 'react';
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
} from '@mui/material';
import {
  Psychology as AIIcon,
  Send as SendIcon,
  ExpandLess,
  ExpandMore,
  SmartToy,
} from '@mui/icons-material';
import type { Store } from '../types/store';

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
  const [response, setResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [aiProvider, setAiProvider] = useState<string | null>(null);

  const handleSubmitQuery = async () => {
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setResponse(null);

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
          query: query.trim(),
          context
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setResponse(data.response);
        setAiProvider(data.source);
      } else {
        setResponse(`Sorry, I couldn't process your question: ${data.error}`);
      }

    } catch (error) {
      console.error('AI Assistant error:', error);
      setResponse('Sorry, I encountered an error while processing your question. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmitQuery();
    }
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
              Ask me anything about your shopping list
            </Typography>
          </Box>
        </Box>
        <IconButton>
          {isExpanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
      </Box>

      {/* Expandable Content */}
      <Collapse in={isExpanded}>
        <Box sx={{ p: 3 }}>
          {/* AI Response */}
          {response && (
            <Paper
              sx={{
                p: 2,
                mb: 3,
                backgroundColor: alpha(theme.palette.success.main, 0.1),
                border: `1px solid ${alpha(theme.palette.success.main, 0.3)}`,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AIIcon sx={{ color: theme.palette.success.main, fontSize: 20 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  AI Assistant Response
                </Typography>
                {aiProvider && (
                  <Chip
                    label={aiProvider === 'open-webui' ? 'Open WebUI' : aiProvider}
                    size="small"
                    variant="outlined"
                    sx={{ ml: 'auto', fontSize: '0.75rem' }}
                  />
                )}
              </Box>
              <Typography
                variant="body2"
                sx={{
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {response}
              </Typography>
            </Paper>
          )}

          {/* Query Input */}
          <Box sx={{ mb: 2 }}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              maxRows={4}
              placeholder="Ask me about your shopping list, price comparisons, alternatives, or money-saving tips..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              sx={{
                '& .MuiOutlinedInput-root': {
                  backgroundColor: theme.palette.background.paper,
                },
              }}
            />
          </Box>

          {/* Submit Button */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
            <Button
              variant="contained"
              onClick={handleSubmitQuery}
              disabled={!query.trim() || isLoading}
              startIcon={
                isLoading ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <SendIcon />
                )
              }
              sx={{ minWidth: 120 }}
            >
              {isLoading ? 'Thinking...' : 'Ask AI'}
            </Button>
          </Box>

          {/* Suggested Questions */}
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
                  onClick={() => setQuery(question)}
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
        </Box>
      </Collapse>
    </Paper>
  );
};

export default AIAssistant;
