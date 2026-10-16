import { Link } from "@mui/material";
import { Link as RouterLink, Navigate, useSearchParams } from "react-router";
import { registerRequestSchema } from "@goldrush/shared";
import { useCurrentUser, useRegister } from "../../api/auth.ts";
import { authPagePath, safeNextPath } from "../../api/next-path.ts";
import { CredentialsForm } from "./CredentialsForm.tsx";

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const { data: user } = useCurrentUser();
  const register = useRegister();

  // Registering signs the user in, so this also redirects after success.
  if (user) {
    return <Navigate to={next} replace />;
  }

  return (
    <CredentialsForm
      title="Create an account"
      submitLabel="Register"
      schema={registerRequestSchema}
      passwordAutoComplete="new-password"
      onSubmit={(credentials) => register.mutate(credentials)}
      isSubmitting={register.isPending}
      error={register.error}
      footer={
        <>
          Already have an account?{" "}
          <Link component={RouterLink} to={authPagePath("/sign-in", next)}>
            Sign in
          </Link>
        </>
      }
    />
  );
}
