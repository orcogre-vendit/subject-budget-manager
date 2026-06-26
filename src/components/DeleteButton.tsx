"use client";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  id: number;
  confirmText: string;
  label?: string;
  extra?: Record<string, string | number>;
};

export default function DeleteButton({
  action,
  id,
  confirmText,
  label = "삭제",
  extra = {},
}: Props) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      {Object.entries(extra).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        className="text-xs font-medium text-red-600 hover:underline"
      >
        {label}
      </button>
    </form>
  );
}
