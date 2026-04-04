export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqGridProps {
  items: FaqItem[];
  className?: string;
}

/** Grid of FAQ cards with Neural Noir styling */
export default function FaqGrid({ className, items }: FaqGridProps) {
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 gap-px bg-fill/5 border border-edge/5 overflow-hidden ${className ?? ''}`}
    >
      {items.map((item) => (
        <div
          key={item.question}
          className="p-10 group bg-zinc-900 hover:bg-fill/[0.02] transition-colors"
        >
          <h3 className="text-lg font-bold mb-3">{item.question}</h3>
          <p className="text-surface/40 text-sm leading-relaxed">
            {item.answer}
          </p>
        </div>
      ))}
    </div>
  );
}
