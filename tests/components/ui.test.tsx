// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Alert, EmptyState, Pagination } from "@/components/ui";
import { Ring } from "@/components/dashboard/ring";
import { DestinationArt } from "@/components/art/destination-art";

describe("UI components", () => {
  it("renders errors as alerts and info as status", () => {
    render(<><Alert tone="error">Bad</Alert><Alert tone="info">Note</Alert></>);
    expect(screen.getByRole("alert")).toHaveTextContent("Bad");
    expect(screen.getByRole("status")).toHaveTextContent("Note");
  });

  it("paginates with disabled edges", () => {
    render(<Pagination page={1} pageCount={3} hrefFor={(p) => `/x?page=${p}`} />);
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/x?page=2");
    expect(screen.queryByRole("link", { name: "Previous" })).toBeNull();
    expect(screen.getByText("Page 1 of 3")).toHaveAttribute("aria-current", "page");
  });

  it("hides pagination for a single page", () => {
    const { container } = render(<Pagination page={1} pageCount={1} hrefFor={() => "/"} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders empty states with actions", () => {
    render(<EmptyState title="Nothing here" description="Try again" action={<button>Go</button>} />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });

  it("labels metric rings", () => {
    render(<Ring fraction={0.5} value={3} label="Trips planned" />);
    expect(screen.getByText("Trips planned")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("keeps illustrations decorative unless labelled", () => {
    const { container, rerender } = render(<DestinationArt variant="coast" seed="a" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    rerender(<DestinationArt variant="coast" seed="a" label="Diani" />);
    expect(screen.getByRole("img", { name: "Diani" })).toBeInTheDocument();
  });
});
