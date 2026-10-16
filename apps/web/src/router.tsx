import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { RegisterPage } from "./pages/auth/RegisterPage.tsx";
import { SignInPage } from "./pages/auth/SignInPage.tsx";

// Every page is a child of Layout. Add new pages here, and put pages that
// need a signed-in user under a RequireUser route
// (components/RequireUser.tsx).
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/sign-in", element: <SignInPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
