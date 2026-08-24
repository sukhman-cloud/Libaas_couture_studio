import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Container, Section } from "@/components/ui/layout";
import { Heading, Text } from "@/components/ui/typography";

/** Shared centered card for the auth pages (login/signup/forgot/reset). */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Container>
      <Section space="lg" className="flex justify-center">
        <div className="w-full max-w-md">
          <Card>
            <CardContent>
              <div className="mb-6 text-center">
                <Heading level={1} className="text-2xl sm:text-3xl">
                  {title}
                </Heading>
                {description && (
                  <Text tone="muted" size="sm" className="mt-1.5">
                    {description}
                  </Text>
                )}
              </div>
              {children}
            </CardContent>
          </Card>
          {footer && (
            <div className="mt-4 text-center text-sm text-muted">{footer}</div>
          )}
        </div>
      </Section>
    </Container>
  );
}
