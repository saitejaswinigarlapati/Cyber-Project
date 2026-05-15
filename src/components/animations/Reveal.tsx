import React from 'react';
import { motion } from 'motion/react';

interface RevealProps {
  children: React.ReactNode;
  width?: 'w-full' | 'w-fit';
  delay?: number;
  duration?: number;
  y?: number;
  className?: string;
}

export const Reveal: React.FC<RevealProps> = ({ 
  children, 
  width = 'w-fit', 
  delay = 0, 
  duration = 0.5,
  y = 20,
  className = ""
}) => {
  return (
    <div className={`${width} ${className}`}>
      <motion.div
        variants={{
          hidden: { opacity: 0, y: y },
          visible: { opacity: 1, y: 0 },
        }}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        transition={{ duration, delay, ease: [0.25, 0.25, 0.25, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
};

export const StaggerContainer: React.FC<{ children: React.ReactNode; className?: string }> = ({ 
  children, 
  className = "" 
}) => {
  return (
    <motion.div
      variants={{
        visible: {
          transition: {
            staggerChildren: 0.1,
          },
        },
      }}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      className={className}
    >
      {children}
    </motion.div>
  );
};
