export function StampGrid({ slots, icon, large = false }: { slots: boolean[]; icon: string; large?: boolean }) {
  return (
    <div className={cnGrid(large)} aria-hidden>
      {slots.map((filled, index) => (
        <span key={index} className={filled ? "stamp on" : "stamp off"}>
          {filled ? icon : ""}
        </span>
      ))}
    </div>
  );
}

function cnGrid(large: boolean) {
  return large ? "grid grid-cols-5 gap-2" : "flex flex-wrap gap-1.5";
}

export function StampMark() {
  return <span className="stamp on h-10 w-10 text-lg" aria-hidden>☕</span>;
}
