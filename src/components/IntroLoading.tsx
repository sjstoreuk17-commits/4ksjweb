import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';

interface IntroLoadingProps {
  progress: number;
  onComplete: () => void;
}

const IntroLoading: React.FC<IntroLoadingProps> = ({ progress, onComplete }) => {
  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    // Smoothly animate the progress number
    const timer = setInterval(() => {
      setDisplayProgress(prev => {
        if (prev < progress) return Math.min(prev + 1, progress);
        return prev;
      });
    }, 20);
    return () => clearInterval(timer);
  }, [progress]);

  useEffect(() => {
    if (displayProgress >= 100) {
      const timeout = setTimeout(() => {
        onComplete();
      }, 800);
      return () => clearTimeout(timeout);
    }
  }, [displayProgress, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.8, ease: [0.43, 0.13, 0.23, 0.96] }}
      className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center overflow-hidden gpu"
    >
      {/* Background Glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/5 blur-[60px] rounded-full" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-blue-600/5 blur-[40px] rounded-full" />

      <div className="relative z-10 flex flex-col items-center gap-12 w-full max-w-md px-8">
        {/* Logo Animation */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="flex flex-col items-center -space-y-2"
        >
          <h1 className="text-6xl md:text-8xl font-display font-black tracking-tighter italic text-white flex items-center">
            <span className="text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">4K</span>
            <span className="text-white">·SJ</span>
          </h1>
          <motion.span 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="text-xs md:text-sm text-cyan-400/60 font-bold uppercase tracking-[0.5em] pl-2 italic"
          >
            Premium Experience
          </motion.span>
        </motion.div>

        {/* Progress Section */}
        <div className="w-full space-y-4">
          <div className="flex justify-between items-end">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 }}
              className="flex flex-col"
            >
              <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Initializing Engine</span>
              <span className="text-xs text-white/80 font-medium">Loading premium assets...</span>
            </motion.div>
            <motion.span 
              className="text-3xl font-display font-black text-cyan-400 tabular-nums"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {displayProgress}%
            </motion.span>
          </div>

          {/* Progress Bar Container */}
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 backdrop-blur-sm">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan-600 via-cyan-400 to-white shadow-[0_0_15px_rgba(34,211,238,0.5)]"
              initial={{ width: "0%" }}
              animate={{ width: `${displayProgress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Status Text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="flex items-center gap-3 text-white/30"
        >
          <Loader2 size={14} className="animate-spin text-cyan-500/50" />
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold">Connecting to Secure Server</span>
        </motion.div>
      </div>

      {/* Decorative Elements */}
      <div className="absolute bottom-12 left-12 flex flex-col gap-1">
        <div className="w-8 h-[1px] bg-white/10" />
        <div className="w-4 h-[1px] bg-white/10" />
      </div>
      <div className="absolute top-12 right-12 flex flex-col items-end gap-1">
        <div className="w-8 h-[1px] bg-white/10" />
        <div className="w-12 h-[1px] bg-white/10" />
      </div>
    </motion.div>
  );
};

export default IntroLoading;
