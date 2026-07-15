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
      className={`grid grid-cols-1 gap-px bg-edge/5 md:grid-cols-2 ${className ?? ''}`}
    >
      {items.map((item) => (
        <div
          key={item.question}
          className="group bg-background p-10 transition-colors hover:bg-fill/[0.02]"
        >
          <h3 className="text-lg font-semibold mb-3">{item.question}</h3>
          <p className="text-surface/65 text-sm leading-relaxed">
            {item.answer}
          </p>
        </div>
      ))}
    </div>
  );
}
