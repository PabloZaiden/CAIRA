interface StreamToggleProps {
  readonly streaming: boolean;
  readonly onChange: (streaming: boolean) => void;
}

export function StreamToggle({ streaming, onChange }: StreamToggleProps) {
  return (
    <label className='flex cursor-pointer items-center gap-2 select-none' data-testid='stream-toggle'>
      <span className='text-xs font-medium text-zinc-400'>{streaming ? 'Streaming' : 'JSON'}</span>
      <button
        type='button'
        role='switch'
        aria-checked={streaming}
        aria-label='Toggle streaming mode'
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 ${
          streaming ? 'bg-indigo-600' : 'bg-zinc-600'
        }`}
        onClick={() => onChange(!streaming)}
        data-testid='stream-toggle-switch'
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            streaming ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
}
