import { createContext, type Accessor } from "solid-js";
export const FeedbackContext = createContext<Accessor<string>>(() => "");
