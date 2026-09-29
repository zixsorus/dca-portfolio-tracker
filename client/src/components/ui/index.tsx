import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { th } from "date-fns/locale";
import { CalendarIcon, Check, ChevronDown, X } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { forwardRef, useState, type ButtonHTMLAttributes, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { twMerge } from "tailwind-merge";

export function cn(...values: Array<string | false | null | undefined>) {
  return twMerge(values.filter(Boolean).join(" "));
}

const buttonVariants = cva("ui-button", {
  variants: {
    variant: {
      default: "primary-button",
      secondary: "secondary-button",
      ghost: "text-button",
      destructive: "danger-solid",
    },
    size: {
      default: "",
      icon: "icon-button",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} data-slot="button" data-variant={variant ?? "default"} data-size={size ?? "default"} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} data-slot="input" className={cn("ui-input", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} data-slot="textarea" className={cn("ui-textarea", className)} {...props} />;
});

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(function Label({ className, ...props }, ref) {
  return <label ref={ref} data-slot="label" className={cn("field", className)} {...props} />;
});

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section data-slot="card" className={className} {...props} />;
}

export function Alert({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="alert" className={className} {...props} />;
}

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="top-center"
      closeButton
      richColors
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "ui-toast",
          title: "ui-toast-title",
          description: "ui-toast-description",
          actionButton: "ui-toast-action",
          cancelButton: "ui-toast-cancel",
          closeButton: "ui-toast-close",
        },
      }}
      {...props}
    />
  );
}

export function Dialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>{children}</DialogPrimitive.Root>;
}

export function DialogContent({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay data-slot="dialog-overlay" className="modal-backdrop" />
    <DialogPrimitive.Content data-slot="dialog-content" className="modal-sheet" aria-describedby={undefined}>
      <div data-slot="dialog-header" className="modal-head">
        <DialogPrimitive.Title data-slot="dialog-title">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="icon" type="button" onClick={onClose} aria-label="ปิดหน้าต่าง"><X aria-hidden="true" size={18} /></Button>
        </DialogPrimitive.Close>
      </div>
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>;
}

type SelectItem = { value: string; label: string };
type SelectProps = {
  name: string;
  items: SelectItem[];
  defaultValue?: string;
  value?: string;
  placeholder?: string;
  required?: boolean;
  onValueChange?: (value: string) => void;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

export function Select({ name, items, defaultValue, value, placeholder = "เลือกตัวเลือก", required, onValueChange, "aria-label": ariaLabel, "aria-invalid": ariaInvalid, "aria-describedby": ariaDescribedBy }: SelectProps) {
  return <SelectPrimitive.Root name={name} defaultValue={value === undefined ? defaultValue : undefined} value={value} required={required} onValueChange={onValueChange}>
    <SelectPrimitive.Trigger data-slot="select-trigger" className="select-trigger" aria-label={ariaLabel} aria-invalid={ariaInvalid} aria-describedby={ariaDescribedBy}>
      <SelectPrimitive.Value placeholder={placeholder} />
      <SelectPrimitive.Icon asChild><ChevronDown size={16} aria-hidden="true" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content data-slot="select-content" className="select-content" position="popper" sideOffset={6}>
        <SelectPrimitive.Viewport className="select-viewport">
          {items.map((item) => <SelectPrimitive.Item key={item.value} value={item.value} className="select-item">
            <SelectPrimitive.ItemText>{item.label}</SelectPrimitive.ItemText>
            <SelectPrimitive.ItemIndicator className="select-indicator"><Check size={15} aria-hidden="true" /></SelectPrimitive.ItemIndicator>
          </SelectPrimitive.Item>)}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>;
}

function parseDate(value: string) {
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const result = new Date(year, month - 1, day);
  return Number.isNaN(result.getTime()) ? undefined : result;
}

function toDateValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DatePicker({ name, defaultValue, required, onValueChange, "aria-label": ariaLabel, "aria-invalid": ariaInvalid, "aria-describedby": ariaDescribedBy }: { name: string; defaultValue?: string; required?: boolean; onValueChange?: (value: string) => void; "aria-label"?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const selected = parseDate(value);
  return <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
    <input type="hidden" name={name} value={value} required={required} />
    <PopoverPrimitive.Trigger asChild>
      <Button variant="secondary" className={cn("date-trigger", !selected && "is-placeholder")} aria-label={ariaLabel} aria-invalid={ariaInvalid} aria-describedby={ariaDescribedBy}>
        <CalendarIcon size={16} aria-hidden="true" />
        {selected ? selected.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }) : "เลือกวันที่"}
      </Button>
    </PopoverPrimitive.Trigger>
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content data-slot="popover-content" className="calendar-popover" sideOffset={6} align="start">
        <DayPicker
          data-slot="calendar"
          mode="single"
          locale={th}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (!date) return;
            const nextValue = toDateValue(date);
            setValue(nextValue);
            onValueChange?.(nextValue);
            setOpen(false);
          }}
        />
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  </PopoverPrimitive.Root>;
}

export const Tabs = TabsPrimitive.Root;
export const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(function TabsList({ className, ...props }, ref) {
  return <TabsPrimitive.List ref={ref} data-slot="tabs-list" className={className} {...props} />;
});
export const TabsTrigger = forwardRef<ElementRef<typeof TabsPrimitive.Trigger>, ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(function TabsTrigger({ className, ...props }, ref) {
  return <TabsPrimitive.Trigger ref={ref} data-slot="tabs-trigger" className={className} {...props} />;
});
