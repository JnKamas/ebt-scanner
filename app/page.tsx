import EbtScanner from "./ui/ebt-web";
import packageInfo from "../package.json";

export default function Home() {
  return <EbtScanner version={packageInfo.version} />;
}
