import EbtScanner from "./ui/ebt-web";
import packageInfo from "../package.json";
import { isDevelopPreview } from "./lib/develop-preview";

export default function Home() {
  return <EbtScanner version={packageInfo.version} showDemoTools={isDevelopPreview()} />;
}
