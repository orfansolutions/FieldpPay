import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, X, Loader2, Brain, MessageSquare, User, Bot, Minimize2, Maximize2 } from 'lucide-react';
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from '../App';

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.APP_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is missing. Please configure it in the Secrets panel.');
  }
  return new GoogleGenAI({ apiKey });
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function PFAI() {
  const { profile, organisation } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isHighIntelligence, setIsHighIntelligence] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    const userMessage = query.trim();
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const ai = getAI();
      const modelName = isHighIntelligence ? "gemini-3.1-pro-preview" : "gemini-3.1-flash-lite-preview";
      
      const response = await ai.models.generateContent({ 
        model: modelName,
        contents: [
          ...messages.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          })),
          { role: 'user', parts: [{ text: userMessage }] }
        ],
        config: {
          systemInstruction: `You are PFAI, a highly intelligent and professional AI assistant for the PaY Flow platform in South Africa. 
            PaY Flow is an expense management system for organisations.
            
            CREATOR INFORMATION:
            PaY Flow was created by Lonwabo Lumko Ntsinde.
            Lonwabo is a South African black man, born on the 12th of March 1990 in Butterworth Hospital.
            His home town is iDutywa, in the Eastern Cape.
            
            User: ${profile?.displayName || 'User'} ${profile?.surname || ''}
            Role: ${profile?.role || 'Guest'}
            Organisation: ${organisation?.name || 'PaY Flow'}
            
            IMPORTANT:
            - Use South African English spellings (e.g., organisation, programme, centre, colour).
            - All monetary values are in South African Rands (ZAR). Use "R" as the currency symbol.
            - Reference SARS, PAYE, UIF, and SDL where relevant to financial discussions.
            
            Your goal is to assist users with:
            1. Navigating the app (Dashboard, Requisitions, Contacts, Projects, Recurring Costs, Payment Schedule, Settings).
            2. Drafting business communications (invites, emails).
            3. Analysing financial data and providing insights.
            4. Explaining platform features (e.g., how payment cycles work, how to rollover financial years).
            
            Be concise, helpful, and maintain a professional yet friendly tone. If you don't know something about the specific data, ask the user for more context.`,
          ...(isHighIntelligence ? { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } } : {})
        }
      });

      const responseText = response.text || "I'm sorry, I couldn't generate a response.";
      
      setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
    } catch (error) {
      console.error('Gemini Error:', error);
      const errorMessage = error instanceof Error && error.message.includes('API key') 
        ? 'AI Assistant is unavailable: API key is missing or invalid.'
        : 'Sorry, I encountered an error. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: errorMessage }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[100] flex flex-col items-end gap-4">
      {/* Assistant Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              y: 0,
              height: isMinimized ? '64px' : '500px',
              width: 'min(380px, calc(100vw - 32px))'
            }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm leading-none">PFAI Assistant</h3>
                  <p className="text-[10px] text-slate-400 mt-1">Online & Ready to help</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setIsHighIntelligence(!isHighIntelligence)}
                  className={cn(
                    "p-2 rounded-lg transition-all flex items-center gap-1.5",
                    isHighIntelligence ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-800"
                  )}
                  title={isHighIntelligence ? "High Intelligence Mode ON" : "Switch to High Intelligence"}
                >
                  <Brain size={16} />
                </button>
                <button 
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400"
                >
                  {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400"
                >
                  <X size={16} />
                </button>
              </div>
            </div>


            {!isMinimized && (
              <>
                {/* Messages */}
                <div 
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50"
                >
                  {messages.length === 0 && (
                    <div className="text-center py-12 space-y-4">
                      <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
                        <MessageSquare size={32} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">Hello, {profile?.displayName}!</p>
                        <p className="text-xs text-slate-500 max-w-[200px] mx-auto mt-1">
                          I'm PFAI. Ask me anything about PaY Flow or your organisation's data.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-2 px-4">
                        <button 
                          onClick={() => setQuery("How do I create a requisition?")}
                          className="text-left p-3 bg-white border border-slate-100 rounded-xl text-xs text-slate-600 hover:border-blue-400 transition-all"
                        >
                          "How do I create a requisition?"
                        </button>
                        <button 
                          onClick={() => setQuery("Show me the payment schedule")}
                          className="text-left p-3 bg-white border border-slate-100 rounded-xl text-xs text-slate-600 hover:border-blue-400 transition-all"
                        >
                          "Show me the payment schedule"
                        </button>
                      </div>
                    </div>
                  )}

                  {messages.map((m, i) => (
                    <div 
                      key={i}
                      className={cn(
                        "flex gap-3 max-w-[85%]",
                        m.role === 'user' ? "ml-auto flex-row-reverse" : ""
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center",
                        m.role === 'user' ? "bg-slate-200 text-slate-600" : "bg-blue-600 text-white"
                      )}>
                        {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                      </div>
                      <div className={cn(
                        "p-3 rounded-2xl text-sm leading-relaxed",
                        m.role === 'user' ? "bg-slate-900 text-white rounded-tr-none" : "bg-white border border-slate-100 shadow-sm rounded-tl-none text-slate-700"
                      )}>
                        {m.content}
                      </div>
                    </div>
                  ))}

                  {loading && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center">
                        <Bot size={16} />
                      </div>
                      <div className="bg-white border border-slate-100 shadow-sm p-3 rounded-2xl rounded-tl-none">
                        <Loader2 className="animate-spin text-blue-600" size={16} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Input */}
                <form onSubmit={handleQuery} className="p-4 bg-white border-t border-slate-100">
                  <div className="relative">
                    <input 
                      type="text"
                      className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all"
                      placeholder="Type your message..."
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                    />
                    <button 
                      type="submit"
                      disabled={!query.trim() || loading}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </form>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      {!isOpen && (
        <motion.button
          layoutId="pfai-button"
          onClick={() => setIsOpen(true)}
          className="w-14 h-14 bg-slate-900 text-white rounded-2xl shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all group relative"
        >
          <Sparkles size={24} className="group-hover:rotate-12 transition-transform" />
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 rounded-full border-2 border-white animate-pulse" />
        </motion.button>
      )}
    </div>
  );
}
