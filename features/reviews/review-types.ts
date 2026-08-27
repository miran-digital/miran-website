export type ReviewStatus = "pending" | "approved" | "rejected";

export type ProductReview = {
  id: string;
  productId: string;
  productTitle: string;
  customerEmail: string;
  customerName: string;
  orderId: string;
  rating: number;
  title: string;
  body: string;
  status: ReviewStatus;
  moderatedBy: string;
  moderatedAt: string;
  moderationNote: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomerReviewState = {
  eligible: boolean;
  review: ProductReview | null;
};

export type PublicProductReview = Pick<
  ProductReview,
  "id" | "customerName" | "rating" | "title" | "body" | "createdAt"
>;
