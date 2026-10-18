import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout.tsx";
import { RequireUser } from "./components/RequireUser.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { RegisterPage } from "./pages/auth/RegisterPage.tsx";
import { SignInPage } from "./pages/auth/SignInPage.tsx";
import { MatchPage } from "./pages/match/MatchPage.tsx";
import { ProfilePage } from "./pages/profile/ProfilePage.tsx";
import { ReplaysPage } from "./pages/replays/ReplaysPage.tsx";
import { UploadPage } from "./pages/upload/UploadPage.tsx";

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
      { path: "/matches/:id", element: <MatchPage /> },
      { path: "/replays", element: <ReplaysPage /> },
      { path: "/users/:username", element: <ProfilePage /> },
      {
        element: <RequireUser />,
        children: [{ path: "/upload", element: <UploadPage /> }],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
