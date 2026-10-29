import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wind Planner | Gestão de Programação Semanal",
  description: "Planejamento conectado. Operação eficiente. Gestão das atas de programação semanal de parques eólicos."
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" suppressHydrationWarning><body>{children}</body></html>;
}