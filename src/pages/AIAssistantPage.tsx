import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { useAuth } from '../AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Send, Bot, User, X, Zap, Brain, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type AIMode = 'flash' | 'pro';

export const AIAssistantPage: React.FC = () => {
  const { profile, organisation } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AIMode>('flash');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string, thoughts?: string }[]>([
    { role: 'assistant', content: `Hello ${profile?.displayName}! I'm your FieldPay Assistant. I can help you with operations, payroll, or reporting. How can I help today?` }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const selectedModel = mode === 'flash' ? 'gemini-3-flash-preview' : 'gemini-3.1-pro-preview';
      
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: [
          ...messages.map(m => ({ 
            role: m.role === 'user' ? 'user' : 'model', 
            parts: [{ text: m.content }] 
          })),
          {
            role: 'user',
            parts: [{ text: `
              Organisation Context: ${organisation?.name} (ID: ${organisation?.id})
              User: ${profile?.displayName} (${profile?.role})
              
              Core App Concept: FieldPay is a South African workforce management system for agriculture/labor-intensive industries.
              Features: Onboarding, Job Cards (Daily work records), Invoicing, Leave, Payroll.
              
              User Query: ${userMessage}
            ` }]
          }
        ],
        config: {
          systemInstruction: "You are the FieldPay Assistant. Provide helpful, concise advice on workforce management, labor relations, and app usage. If using Google Search, cite sources for labor laws.",
          tools: mode === 'flash' ? [{ googleSearch: {} }] : undefined,
          thinkingConfig: mode === 'pro' ? { thinkingLevel: ThinkingLevel.HIGH } : undefined
        }
      });

      const assistantMessage = response.text || "I'm sorry, I couldn't process that request.";
      const thoughts = response.candidates?.[0]?.groundingMetadata?.searchEntryPoint?.renderedContent;
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: assistantMessage,
        thoughts: thoughts
      }]);
    } catch (error: any) {
      console.error("AI Error:", error);
      toast.error("AI Service Issue: " + (error.message || "Unknown error"));
      setMessages(prev => [...prev, { role: 'assistant', content: "I encountered an error connecting to my brain. Please try again or switch modes." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-120px)] flex flex-col pt-4 animate-in slide-in-from-bottom-4 duration-500">
      {/* Mode Selector */}
      <div className="flex gap-2 mb-4 justify-center">
        <Button 
          variant={mode === 'flash' ? 'default' : 'outline'} 
          size="sm" 
          onClick={() => setMode('flash')}
          className="rounded-full font-black text-[10px] uppercase tracking-widest gap-2"
        >
          <Zap className="w-3 h-3" /> <Search className="w-3 h-3" /> Fast + Search
        </Button>
        <Button 
          variant={mode === 'pro' ? 'default' : 'outline'} 
          size="sm" 
          onClick={() => setMode('pro')}
          className="rounded-full font-black text-[10px] uppercase tracking-widest gap-2"
        >
          <Brain className="w-3 h-3" /> Deep Thinking
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden border-[var(--color-border)] shadow-2xl rounded-[2.5rem] bg-white">
        <CardHeader className="border-b border-gray-100 flex flex-row items-center justify-between py-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary)] flex items-center justify-center text-white shadow-xl shadow-[var(--color-primary)]/20 rotate-3">
              <Bot className="w-7 h-7" />
            </div>
            <div>
              <CardTitle className="text-xl font-black tracking-tight text-[var(--color-secondary)]">FieldPay AI</CardTitle>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-black">
                  {mode === 'flash' ? 'Lightning Flash' : 'High Performance Reasoning'}
                </p>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="hover:bg-gray-100 rounded-2xl">
            <X className="w-5 h-5 text-gray-400" />
          </Button>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden p-0 flex flex-col bg-gray-50/30">
          <ScrollArea className="flex-1 p-8" ref={scrollRef}>
            <div className="space-y-8">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                  <div className="flex flex-col max-w-[85%] gap-2">
                    <div className={cn(
                      "p-5 rounded-[2rem] shadow-sm relative",
                      m.role === 'user' 
                        ? "bg-[var(--color-primary)] text-white rounded-tr-none" 
                        : "bg-white text-gray-800 border-2 border-gray-100 rounded-tl-none"
                    )}>
                      <div className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{m.content}</div>
                    </div>
                    {m.thoughts && (
                      <div className="bg-blue-50/50 p-3 rounded-2xl text-[10px] text-blue-700 italic border border-blue-100/50" 
                           dangerouslySetInnerHTML={{ __html: m.thoughts }} />
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start animate-in fade-in duration-300">
                  <div className="bg-white border-2 border-gray-100 p-5 rounded-[2rem] rounded-tl-none flex gap-2">
                    <div className="w-2 h-2 bg-[var(--color-primary)] rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-[var(--color-primary)] rounded-full animate-bounce delay-100" />
                    <div className="w-2 h-2 bg-[var(--color-primary)] rounded-full animate-bounce delay-200" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          
          <div className="p-8 bg-white border-t border-gray-100 flex gap-4">
            <div className="flex-1 relative group">
              <Input 
                placeholder={mode === 'flash' ? "Search labor laws or ask about the app..." : "Ask a complex operational question..."}
                value={input} 
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-[1.5rem] py-8 px-6 focus-visible:ring-[var(--color-primary)] focus-visible:border-[var(--color-primary)]/50 transition-all font-medium pr-16"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-300 group-focus-within:text-[var(--color-primary)] transition-colors">
                {mode === 'flash' ? <Zap className="w-5 h-5" /> : <Brain className="w-5 h-5" />}
              </div>
            </div>
            <Button 
              onClick={handleSend} 
              disabled={isLoading || !input.trim()}
              className="bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white rounded-[1.5rem] w-16 h-16 p-0 shadow-2xl shadow-[var(--color-primary)]/30 shrink-0 transition-transform active:scale-95 disabled:opacity-50"
            >
              <Send className="w-6 h-6" />
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <p className="text-center text-[10px] text-gray-400 mt-4 font-bold uppercase tracking-widest">
        Powered by Google Gemini 3 Technology • Sector-Specific Knowledge
      </p>
    </div>
  );
};
