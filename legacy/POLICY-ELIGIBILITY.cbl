       IDENTIFICATION DIVISION.
       PROGRAM-ID. POLICY-ELIGIBILITY.

       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-POLICY.
           05 WS-ISSUE-YEAR       PIC 9(4).
           05 WS-STATUS           PIC X(12).
           05 WS-CANCEL-REASON    PIC X(20).
           05 WS-CLAIM-AMOUNT     PIC 9(7)V99.
       01  WS-DECISION            PIC X(24).

       PROCEDURE DIVISION.
       DETERMINE-ELIGIBILITY.
      *    Fraud is an override and must be checked first.
           IF WS-CANCEL-REASON = "FRAUD"
               MOVE "DENIED-FRAUD" TO WS-DECISION
           ELSE
               IF WS-ISSUE-YEAR < 2010
                   MOVE "ELIGIBLE-LEGACY" TO WS-DECISION
               ELSE
                   IF WS-STATUS = "ACTIVE"
                      AND WS-CLAIM-AMOUNT <= 50000
                       MOVE "ELIGIBLE_STANDARD" TO WS-DECISION
                   ELSE
                       MOVE "MANUAL-REVIEW" TO WS-DECISION
                   END-IF
               END-IF
           END-IF.

           DISPLAY WS-DECISION.
           STOP RUN.
