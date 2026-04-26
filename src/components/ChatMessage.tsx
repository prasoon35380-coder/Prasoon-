import { motion } from "motion/react";
import ReactMarkdown from "react-markdown";
import { User, Bot } from "lucide-react";
import { cn } from "@/src/lib/utils";

interface ChatMessageProps {
  role: 'user' | 'model';
  content: string;
  isStreaming?: boolean;
}

export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex w-full gap-6 p-6 md:p-8",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div className={cn(
        "flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full shadow-lg border",
        isUser 
          ? "bg-slate-800 border-white/20" 
          : "bg-gradient-to-tr from-cyan-500 to-blue-600 border-transparent text-white"
      )}>
        {isUser ? <User size={20} /> : <Bot size={20} />}
      </div>
      
      <div className={cn(
        "max-w-3xl flex-1 space-y-2 p-6 rounded-3xl shadow-2xl backdrop-blur-sm",
        isUser 
          ? "bg-cyan-600/20 border border-cyan-400/30 rounded-tr-none text-cyan-50" 
          : "bg-white/5 border border-white/10 rounded-tl-none text-slate-300"
      )}>
        <div className="prose prose-sm dark:prose-invert max-w-none break-words leading-relaxed">
          <ReactMarkdown>
            {content + (isStreaming ? " ▋" : "")}
          </ReactMarkdown>
        </div>
        {!isUser && (
          <div className="mt-4 flex gap-2">
            <span className="px-2 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] rounded uppercase tracking-wider font-semibold">Verified</span>
            <span className="px-2 py-1 bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] rounded uppercase tracking-wider font-semibold">Nexus Engine</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
