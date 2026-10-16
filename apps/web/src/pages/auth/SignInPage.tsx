import { Link } from "@mui/material";
import { Link as RouterLink, Navigate, useSearchParams } from "react-router";
import { signInRequestSchema } from "@goldrush/shared";
import { useCurrentUser, useSignIn } from "../../api/auth.ts";
import { authPagePath, safeNextPath } from "../../api/next-path.ts";
import { CredentialsForm } from "./CredentialsForm.tsx";

export function SignInPage() {
  const [searchParams] = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const { data: user } = useCurrentUser();
  const signIn = useSignIn();

  // Signing in sets the current user, so this also redirects after success.
  if (user) {
    return <Navigate to={next} replace />;
  }

  return (
    <CredentialsForm
      title="Sign in"
      submitLabel="Sign in"
      schema={signInRequestSchema}
      passwordAutoComplete="current-password"
      onSubmit={(credentials) => signIn.mutate(credentials)}
      isSubmitting={signIn.isPending}
      error={signIn.error}
      footer={
        <>
          No account yet?{" "}
          <Link component={RouterLink} to={authPagePath("/register", next)}>
            Register
          </Link>
        </>
      }
    />
  );
}
